import Darwin
import Foundation
import Tokenizers

// Python이 만든 비교 입력을 받아 TTS와 같은 Swift API로 인코딩한다.
@main
private struct TokenizerCheck {
    struct Input: Decodable {
        struct Case: Decodable {
            let id: String
            let text: String
            let tokenIds: [Int]
        }
        let model: String
        let cases: [Case]
    }

    static func main() async throws {
        let input = try JSONDecoder().decode(
            Input.self, from: FileHandle.standardInput.readDataToEndOfFile())
        let tokenizer = try await AutoTokenizer.from(modelFolder: URL(fileURLWithPath: input.model))
        var results = [[String: Any]]()
        var allMatch = true
        for item in input.cases {
            let actual = tokenizer.encode(text: item.text)
            let match = actual == item.tokenIds
            allMatch = allMatch && match
            results.append(["id": item.id, "match": match, "tokenIds": actual])
        }
        let result: [String: Any] = ["model": input.model, "allMatch": allMatch, "cases": results]
        var data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        data.append(0x0a)
        try FileHandle.standardOutput.write(contentsOf: data)
        if !allMatch { exit(1) }
    }
}
