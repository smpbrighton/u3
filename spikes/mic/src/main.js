import { invoke } from "@tauri-apps/api/core";

const candidateTypes = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/wav",
];
const status = document.querySelector("#status");
const result = {
  supportedTypes: {},
  chosenMimeType: null,
  recordingDurationMs: null,
  error: null,
  file: null,
};

async function saveResult() {
  await invoke("write_result", { json: JSON.stringify(result, null, 2) });
  status.textContent = JSON.stringify(result, null, 2);
}

async function record() {
  result.supportedTypes = Object.fromEntries(
    candidateTypes.map((type) => [type, MediaRecorder.isTypeSupported(type)]),
  );
  result.chosenMimeType = candidateTypes.find((type) => result.supportedTypes[type]) ?? null;
  await saveResult();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = result.chosenMimeType ? { mimeType: result.chosenMimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    const chunks = [];
    const startedAt = performance.now();
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener("error", () => reject(recorder.error ?? new Error("MediaRecorder error")), { once: true });
    });
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    recorder.stop();
    await stopped;
    result.recordingDurationMs = Math.round(performance.now() - startedAt);
    const blob = new Blob(chunks, { type: recorder.mimeType || result.chosenMimeType || "application/octet-stream" });
    const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("webm") ? "webm" : "wav";
    const bytes = [...new Uint8Array(await blob.arrayBuffer())];
    result.file = await invoke("write_capture", { filename: `recording.${extension}`, bytes });
    await saveResult();
  } catch (error) {
    result.error = String(error?.stack ?? error);
    await saveResult();
  } finally {
    stream?.getTracks().forEach((track) => track.stop());
  }
}

record().catch(async (error) => {
  result.error = String(error?.stack ?? error);
  await saveResult();
});
