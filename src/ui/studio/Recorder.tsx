import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button as FileButton } from "../components/ui/button";
import { Button } from "../components/ui/button";
import type { AudioClip } from "../../core/schema";
import { api, mediaUrl } from "../api";

type UploadedVoice = { file: string; durationSec: number };

export function Recorder(props: {
  projectId: string;
  actions?: React.ReactNode;
  clips: AudioClip[];
  onAdd: (file: string, durationSec: number) => void;
  onRecordingChange: (recording: boolean) => void;
  onError: (message: string) => void;
  onSnackbar: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const waveform = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const recordingChangeRef = useRef(props.onRecordingChange);
  recordingChangeRef.current = props.onRecordingChange;
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    let active = true;
    let instance: WaveSurfer | undefined;
    const colors = () => ({ waveColor: getComputedStyle(waveform.current!).getPropertyValue("--muted-foreground").trim(), progressColor: getComputedStyle(waveform.current!).getPropertyValue("--foreground").trim(), cursorColor: getComputedStyle(waveform.current!).getPropertyValue("--foreground").trim() });
    const themeObserver = new MutationObserver(() => { if (waveform.current) instance?.setOptions(colors()); });
    if (!selectedFile || !waveform.current) return;
    void mediaUrl(props.projectId, selectedFile).then(url => {
      if (!active || !waveform.current) return;
      instance = WaveSurfer.create({
        container: waveform.current,
        height: 44,
        waveColor: getComputedStyle(waveform.current).getPropertyValue("--muted-foreground").trim(),
        progressColor: getComputedStyle(waveform.current).getPropertyValue("--foreground").trim(),
        cursorColor: getComputedStyle(waveform.current).getPropertyValue("--foreground").trim(),
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      void instance.load(url).catch(() => undefined);
    }).catch(error => props.onError(error instanceof Error ? error.message : String(error)));
    return () => {
      active = false;
      themeObserver.disconnect();
      instance?.destroy();
    };
  }, [props.projectId, props.onError, selectedFile]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    recordingChangeRef.current(false);
  }, []);

  async function upload(file: File, recordingFile = false) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (recordingFile) form.set("recording", "true");
      const saved = await api<UploadedVoice>("POST", `/api/projects/${encodeURIComponent(props.projectId)}/voice`, form);
      setSelectedFile(saved.file);
      props.onAdd(saved.file, saved.durationSec);
      props.onSnackbar("음성 클립을 추가했어요.");
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("이 브라우저는 마이크 녹음을 지원하지 않아요.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstart = () => {
        startedAtRef.current = performance.now();
        setElapsed(0);
        setRecording(true);
        props.onRecordingChange(true);
      };
      recorder.onstop = () => {
        setRecording(false);
        props.onRecordingChange(false);
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        const type = recorder.mimeType || mimeType || "audio/mp4";
        const extension = type.includes("webm") ? "webm" : "m4a";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size) void upload(new File([blob], `recording.${extension}`, { type }), true);
      };
      recorder.onerror = () => props.onError("마이크 녹음에 실패했어요.");
      recorderRef.current = recorder;
      recorder.start(1000);
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) await upload(file);
  }

  const recordings = props.clips;

  return <div className="studio-recorder">
    <div className={`studio-recorder-control${recording ? " is-recording" : ""}`}>
      <Button variant="secondary" disabled={busy} onClick={() => recording ? stopRecording() : void startRecording()}>
        {recording ? "멈추기" : "녹음"}
      </Button>
      <span className="studio-recorder-time">{formatTime(recording ? elapsed : 0)}</span>
      {recording ? <span className="studio-recorder-status" role="status">녹음 중</span> : null}
    </div>
    <FileButton variant="outline" className="w-full justify-start" disabled={busy || recording} onClick={() => fileInput.current?.click()}>{busy ? "저장 중" : "파일 불러오기"}</FileButton>
    {props.actions}
    <input ref={fileInput} className="hidden" type="file" accept=".m4a,.mp3,.wav,audio/mp4,audio/mpeg,audio/wav" disabled={busy || recording} onChange={e => void importFile(e)} />

    {recordings.length ? <ul className="studio-voice-list">{recordings.map((clip, index) => <li key={clip.id}>
      <Button variant="secondary" type="button" className={clip.file === selectedFile ? "is-selected" : ""} onClick={() => setSelectedFile(clip.file)}>
        <span>{clip.file.split("/").at(-1) ?? `녹음 ${index + 1}`}</span>
        <small>{formatTime(clip.inEndSec - clip.inStartSec)}</small>
      </Button>
    </li>)}</ul> : <p className="studio-help">아직 음성이 없어요</p>}
    <div ref={waveform} className="studio-waveform" aria-label="음성 파형" />
  </div>;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}.${Math.floor((safe % 1) * 10)}`;
}
