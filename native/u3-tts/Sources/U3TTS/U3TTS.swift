import Darwin
import Foundation
import MLX
import Qwen3TTS

private struct Request: Decodable {
    struct Item: Decodable {
        let id: String
        let text: String
    }
    let model: String
    let speaker: String
    let instruct: String?
    let items: [Item]
    let outDir: String
}

private struct Failure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}

private struct Options {
    let metallib: String
    let cacheLimitBytes: Int?
    let memoryLimitBytes: Int?

    init(_ arguments: [String]) throws {
        var values = [String: String]()
        guard arguments.count % 2 == 0 else { throw Failure("옵션마다 값이 필요합니다.") }
        for index in stride(from: 0, to: arguments.count, by: 2) {
            let key = arguments[index]
            guard ["--metallib", "--cache-limit-mb", "--memory-limit-mb"].contains(key),
                  values[key] == nil else { throw Failure("알 수 없거나 중복된 옵션입니다: \(key)") }
            values[key] = arguments[index + 1]
        }
        guard let path = values["--metallib"] else {
            throw Failure("--metallib <default.metallib 경로>가 필요합니다.")
        }
        func bytes(_ key: String) throws -> Int? {
            guard let value = values[key] else { return nil }
            guard !value.isEmpty, value.allSatisfy({ $0.isASCII && $0.isNumber }),
                  let mb = Int(value), mb <= Int.max / 1_048_576 else {
                throw Failure("\(key)는 0 이상의 정수여야 합니다.")
            }
            return mb * 1_048_576
        }
        metallib = path
        cacheLimitBytes = try bytes("--cache-limit-mb")
        memoryLimitBytes = try bytes("--memory-limit-mb")
    }
}

private func memoryStats() -> [String: Int] {
    let snapshot = GPU.snapshot()
    return ["activeBytes": snapshot.activeMemory, "cacheBytes": snapshot.cacheMemory,
            "peakActiveBytes": snapshot.peakMemory]
}

// 라이브러리의 print/debugPrint는 stderr로 보내고, 원래 stdout에는 JSON만 쓴다.
private struct Events {
    let output: FileHandle

    init() throws {
        fflush(stdout)
        let descriptor = dup(STDOUT_FILENO)
        guard descriptor >= 0 else { throw Failure("stdout 복제에 실패했습니다.") }
        guard dup2(STDERR_FILENO, STDOUT_FILENO) >= 0 else {
            close(descriptor)
            throw Failure("라이브러리 로그 분리에 실패했습니다.")
        }
        output = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
    }

    func send(_ event: String, _ fields: [String: Any] = [:]) throws {
        var value = fields
        value["event"] = event
        var data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        data.append(0x0a)
        try output.write(contentsOf: data)
    }
}

@main
private struct U3TTS {
    static func main() async {
        let arguments = Array(CommandLine.arguments.dropFirst())
        if arguments == ["--help"] || arguments == ["-h"] {
            print("""
            사용법: u3-tts --metallib <default.metallib 경로> [--cache-limit-mb N] [--memory-limit-mb N]
            한도 인자의 1 MB는 1,048,576 bytes입니다. 생략하면 MLX 기본값을 씁니다.
            cache-limit-mb 0은 캐시를 끕니다. memory-limit는 엄격한 프로세스 메모리 한도가 아닙니다.
            stdin JSON: {model, speaker, instruct?, items: [{id, text}], outDir}
            model은 로컬 CustomVoice 폴더입니다. 언어는 korean입니다.
            출력은 24 kHz mono WAV와 stdout JSONL 이벤트입니다.
            이벤트: loading, loaded, itemStarted, progress, itemDone, done, error.
            MLX active/cache/peakActive 메모리는 이벤트의 memory 필드에 bytes로 기록합니다.
            MLX 0.29.1의 상대 경로 로더를 위해 metallib 폴더로 이동합니다.
            """)
            return
        }

        var events: Events?
        do {
            let stream = try Events()
            events = stream
            let options = try Options(arguments)
            let started = Date()
            let request = try JSONDecoder().decode(
                Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
            let modelURL = URL(fileURLWithPath: request.model).standardizedFileURL
            let outURL = URL(fileURLWithPath: request.outDir).standardizedFileURL
            let libraryURL = URL(fileURLWithPath: options.metallib).standardizedFileURL
            guard libraryURL.lastPathComponent == "default.metallib",
                  FileManager.default.isReadableFile(atPath: libraryURL.path) else {
                throw Failure("읽을 수 있는 default.metallib 파일이 필요합니다.")
            }
            guard !request.items.isEmpty else { throw Failure("items가 비었습니다.") }
            var ids = Set<String>()
            for item in request.items {
                guard item.id.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]*$", options: .regularExpression) != nil,
                      ids.insert(item.id).inserted else {
                    throw Failure("항목 id는 중복 없는 영문·숫자·밑줄·하이픈이어야 합니다.")
                }
                guard !item.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    throw Failure("항목 \(item.id)의 text가 비었습니다.")
                }
            }
            // 이 버전은 METAL_PATH="default.metallib"를 마지막으로 찾는다.
            // 모델·출력 경로는 이동 전에 절대 경로로 확정한다.
            guard FileManager.default.changeCurrentDirectoryPath(
                libraryURL.deletingLastPathComponent().path) else {
                throw Failure("metallib 폴더로 이동하지 못했습니다.")
            }
            try FileManager.default.createDirectory(at: outURL, withIntermediateDirectories: true)
            if let limit = options.memoryLimitBytes { GPU.set(memoryLimit: limit) }
            if let limit = options.cacheLimitBytes { GPU.set(cacheLimit: limit) }
            try stream.send("loading", ["model": modelURL.path, "metallib": libraryURL.path,
                "cacheLimitBytes": GPU.cacheLimit, "memoryLimitBytes": GPU.memoryLimit,
                "memory": memoryStats()])
            MLXRandom.seed(0)
            let model = try await Qwen3TTSModel.fromPretrained(modelURL.path)
            guard model.config.ttsModelType == "custom_voice" else {
                throw Failure("CustomVoice 모델만 지원합니다.")
            }
            guard model.supportedSpeakers.contains(where: {
                $0.lowercased() == request.speaker.lowercased()
            }) else { throw Failure("지원하지 않는 화자입니다: \(request.speaker)") }
            let loadSec = Date().timeIntervalSince(started)
            try stream.send("loaded", ["loadSec": loadSec, "speaker": request.speaker,
                                       "language": "korean", "memory": memoryStats()])

            for (index, item) in request.items.enumerated() {
                let itemStarted = Date()
                try stream.send("itemStarted", ["id": item.id, "completed": index,
                                                "total": request.items.count, "memory": memoryStats()])
                var tokens = 0
                var saved = false
                for try await event in model.generateStream(
                    text: item.text,
                    speaker: request.speaker,
                    instruct: request.instruct.flatMap { $0.isEmpty ? nil : $0 },
                    language: "korean"
                ) {
                    switch event {
                    case .token:
                        tokens += 1
                        if tokens % 12 == 0 {
                            try stream.send("progress", ["id": item.id, "tokens": tokens, "completed": index,
                                                         "total": request.items.count, "memory": memoryStats()])
                        }
                    case .info:
                        break
                    case .audio(let audio):
                        let output = outURL.appendingPathComponent(item.id + ".wav")
                        try saveAudioArray(audio, sampleRate: 24_000, to: output)
                        saved = true
                        try stream.send("itemDone", ["id": item.id, "path": output.path,
                            "durationSec": Double(audio.size) / 24_000,
                            "elapsedSec": Date().timeIntervalSince(itemStarted), "sampleRate": 24_000,
                            "completed": index + 1, "total": request.items.count, "memory": memoryStats()])
                    }
                }
                guard saved else { throw Failure("항목 \(item.id)의 음성이 생성되지 않았습니다.") }
            }
            try stream.send("done", ["completed": request.items.count, "total": request.items.count,
                "elapsedSec": Date().timeIntervalSince(started), "loadSec": loadSec, "memory": memoryStats()])
        } catch {
            try? events?.send("error", ["message": error.localizedDescription])
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
            exit(1)
        }
    }
}
