import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState } from "react";
import { timelineToRender } from "../../core/timeline/to-render";
import type { Project } from "../../core/schema";
import { U3Short } from "../../remotion/U3Short";
import type { U3ShortProps } from "../../remotion/types";
import { api, libraryMediaUrl, mediaUrl } from "../api";
import { libraryReferencePath } from "../../core/library-reference";
import { frameForTime, frameToSeekAfterPlayerReady } from "./preview-seek";
import { hasAllRenderSources } from "./preview-sources";

export function Preview(props: {
  project: Project;
  time: number;
  playing: boolean;
  muteOriginal?: boolean;
  onTime: (time: number) => void;
  onPlaying: (playing: boolean) => void;
}) {
  const playerRef = useRef<PlayerRef>(null);
  const [sources, setSources] = useState<{ inputs: Record<string, string>; memes: Record<string, string>; files: Record<string, string> }>({ inputs: {}, memes: {}, files: {} });
  const render = useMemo(() => timelineToRender(props.project.timeline), [props.project.timeline]);
  const sourcesReady = hasAllRenderSources(render, { ...sources, overlayInputs: sources.inputs });
  useEffect(() => {
    let active = true;
    void (async () => {
      const [inputEntries, memeItems, fileEntries] = await Promise.all([
        Promise.all(props.project.inputs.map(async (input) => [input.id, await mediaUrl(props.project.id, input.file)] as const)),
        api<{ id: string; url: string }[]>("GET", "/api/library/memes").catch(() => []),
        Promise.all(render.audio.filter((layer) => layer.file && !layer.file.startsWith("http")).map(async (layer) => [layer.file!, libraryReferencePath(layer.file!)
          ? await libraryMediaUrl(layer.file!)
          : await mediaUrl(props.project.id, layer.file!)] as const)),
      ]);
      if (!active) return;
      const memeById = new Map(memeItems.map((item) => [item.id, item.url]));
      const referencedMemeIds = [
        ...render.video.filter((item) => item.kind === "meme").map((item) => item.memeId!),
        ...render.overlay.filter((item) => item.kind === "meme").map((item) => item.memeId!),
        ...render.audio.filter((item) => item.track === "meme").map((item) => item.inputId!),
      ];
      const missingMemeIds = [...new Set(referencedMemeIds)].filter((id) => !memeById.has(id));
      const extraMemes = await Promise.all(missingMemeIds.map(async (id) => {
        const matches = await api<{ id: string; url: string }[]>("GET", `/api/library/memes?q=${encodeURIComponent(id)}`).catch(() => []);
        return matches.find((item) => item.id === id);
      }));
      if (!active) return;
      extraMemes.forEach((item) => { if (item) memeById.set(item.id, item.url); });
      setSources({
        inputs: Object.fromEntries(inputEntries),
        memes: Object.fromEntries(memeById),
        files: { ...Object.fromEntries(fileEntries), ...Object.fromEntries(render.audio.filter((layer) => layer.file?.startsWith("http")).map((layer) => [layer.file!, layer.file!])) },
      });
    })().catch(() => {});
    return () => { active = false; };
  }, [props.project.id, props.project.inputs, render.video, render.audio, render.overlay]);
  const propsForPlayer = useMemo<U3ShortProps>(() => ({
    render: {
      ...render,
      audio: render.audio.map((layer) => ({
        ...layer,
        ...(props.muteOriginal && (layer.track === "source" || layer.track === "stem-voice" || layer.track === "stem-bg") ? { volume: 0 } : {}),
        ...(layer.file && sources.files[layer.file] ? { file: sources.files[layer.file] } : {}),
      })),
    },
    inputs: sources.inputs,
    inputKinds: Object.fromEntries(props.project.inputs.map((input) => [input.id, input.kind])),
    memes: sources.memes,
    overlayInputs: sources.inputs,
    memeFrames: {},
  }), [props.project.id, props.project.inputs, render, sources, props.muteOriginal]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const update = ({ detail }: { detail: { frame: number } }) => props.onTime(detail.frame / render.fps);
    const ended = () => props.onPlaying(false);
    player.addEventListener("timeupdate", update);
    player.addEventListener("ended", ended);
    return () => {
      player.removeEventListener("timeupdate", update);
      player.removeEventListener("ended", ended);
    };
  }, [props.onPlaying, props.onTime, render.fps, sourcesReady]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !sourcesReady) return;
    if (props.playing) player.play();
    else player.pause();
  }, [props.playing, sourcesReady]);

  useEffect(() => {
    const player = playerRef.current;
    const frame = frameToSeekAfterPlayerReady(sourcesReady, props.time, render.durationInFrames, render.fps);
    if (!player || frame === null) return;
    if (Math.abs(player.getCurrentFrame() - frame) > 1) player.seekTo(frame);
  }, [props.time, render.durationInFrames, render.fps, sourcesReady]);

  return <div className="studio-preview-player">
    {render.durationInFrames > 0 && sourcesReady ? <Player
      ref={playerRef}
      component={U3Short}
      inputProps={propsForPlayer}
      durationInFrames={render.durationInFrames}
      initialFrame={frameForTime(props.time, render.durationInFrames, render.fps)}
      compositionWidth={1080}
      compositionHeight={1920}
      fps={render.fps}
      controls={false}
      acknowledgeRemotionLicense
      clickToPlay={false}
      spaceKeyToPlayOrPause={false}
      moveToBeginningWhenEnded={false}
      style={{ width: "100%", height: "100%" }}
    /> : render.durationInFrames > 0 ? <p>미리보기를 준비하고 있어요.</p> : <p>타임라인에 미디어를 넣어 주세요.</p>}
  </div>;
}
