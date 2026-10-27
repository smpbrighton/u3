import { Player, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captionLayersOf, DEFAULT_BRAND_SETTINGS, withCaptionLayers, type BrandSettings, type Project, type Timeline } from "../../core/schema";
import { timelineToRender } from "../../core/timeline/to-render";
import { U3Short } from "../../remotion/U3Short";
import type { U3ShortProps } from "../../remotion/types";
import { api, brandMediaUrl, libraryMediaUrl, mediaUrl } from "../api";
import { libraryReferencePath } from "../../core/library-reference";
import { frameForTime, frameToSeekAfterPlayerReady } from "./preview-seek";
import { hasAllRenderSources } from "./preview-sources";
import { PreviewEditLayer, type PreviewEditTarget } from "./PreviewEditLayer";
import { captionTargetBox, mediaTargetBox, type NormalizedBox } from "../../core/preview-geometry";
import { useFontRevision } from "../../remotion/fonts";
import { measureCaption } from "../../remotion/caption-measure";
import { findOverlayInLayers, updateOverlayInLayers } from "../../core/timeline/overlay-layers";

const DEFAULT_MEDIA_ASPECT = 9 / 16;

type MemeSource = { id: string; url: string; width?: number; height?: number };

export function Preview(props: {
  project: Project;
  time: number;
  playing: boolean;
  muteOriginal?: boolean;
  onTime: (time: number) => void;
  onPlaying: (playing: boolean) => void;
  selectedId: string | null;
  selectedIds: readonly string[];
  safeZone: boolean;
  onSelectTarget: (id: string, kind: "overlay" | "caption-layer" | "watermark") => void;
  onEditTimeline: (timeline: Timeline) => void;
}) {
  const fontRevision = useFontRevision();
  const playerRef = useRef<PlayerRef>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [mediaAspects, setMediaAspects] = useState<Record<string, number>>({});
  const [previewTimeline, setPreviewTimeline] = useState(props.project.timeline);
  useEffect(() => setPreviewTimeline(props.project.timeline), [props.project.timeline]);
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [sources, setSources] = useState<{ inputs: Record<string, string>; memes: Record<string, string>; memeAspects: Record<string, number>; files: Record<string, string> }>({ inputs: {}, memes: {}, memeAspects: {}, files: {} });
  const render = useMemo(() => timelineToRender(previewTimeline, brand), [previewTimeline, brand]);
  const titleBarHeight = render.titleBar?.visible ? render.titleBar.height : undefined;
  const targets = useMemo<PreviewEditTarget[]>(() => {
    const currentFrame = Math.round(props.time * render.fps);
    const overlayTargets = render.overlay.filter((clip) => clip.startFrame <= currentFrame && currentFrame < clip.startFrame + clip.durationInFrames).map((clip) => ({
      id: clip.id, kind: "overlay" as const, canResize: true, resizeProportionally: true,
      box: mediaTargetBox(clip, clip.width, (clip.kind === "meme" ? sources.memeAspects[clip.memeId!] : undefined) ?? mediaAspects[clip.id] ?? DEFAULT_MEDIA_ASPECT),
    }));
    const layers = captionLayersOf(previewTimeline);
    const captionTargets = (fontRevision ? layers : []).flatMap((layer) => {
      const at = (clips: typeof layer.main) => clips.find((clip) => clip.startSec * render.fps <= currentFrame && clip.endSec * render.fps > currentFrame);
      const rows = [["main", at(layer.main)], ["sub", at(layer.sub)]] as const;
      const sizes = rows.flatMap(([row, clip]) => clip ? [measureCaption(clip.text, layer.style, row)] : []);
      if (!sizes.length) return [];
      const size = { width: Math.max(...sizes.map((item) => item.width)), height: sizes.reduce((sum, item) => sum + item.height, 0) };
      return [{ id: layer.id, kind: "caption-layer" as const, canResize: false, box: captionTargetBox(layer, size) }];
    });
    const watermark = render.watermark;
    const watermarkTarget = watermark?.visible ? [{ id: "watermark", kind: "watermark" as const, canResize: true, box: mediaTargetBox(watermark, watermark.width, mediaAspects.watermark ?? DEFAULT_MEDIA_ASPECT) }] : [];
    return [...overlayTargets, ...captionTargets, ...watermarkTarget];
  }, [previewTimeline, props.time, render, mediaAspects, sources.memeAspects, fontRevision]);
  const changeTarget = useCallback((timeline: Timeline, id: string, kind: PreviewEditTarget["kind"], box: NormalizedBox): Timeline => {
    if (kind === "overlay") return { ...timeline, overlays: updateOverlayInLayers(timeline.overlays, id, (clip) => ({ ...clip, x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width })) };
    if (kind === "caption-layer") return withCaptionLayers(timeline, captionLayersOf(timeline).map((layer) => layer.id === id ? { ...layer, x: box.x + box.width / 2, y: box.y + box.height } : layer));
    return { ...timeline, brand: { ...timeline.brand, watermark: { ...timeline.brand?.watermark, x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width } } };
  }, []);
  const previewTarget = useCallback((id: string, box: NormalizedBox) => {
    const kind = targets.find((target) => target.id === id)?.kind;
    if (kind) setPreviewTimeline((current) => changeTarget(current, id, kind, box));
  }, [targets, changeTarget]);
  const commitTarget = useCallback((id: string, box: NormalizedBox) => {
    const kind = targets.find((target) => target.id === id)?.kind;
    if (kind) props.onEditTimeline(changeTarget(previewTimeline, id, kind, box));
  }, [targets, changeTarget, previewTimeline, props.onEditTimeline]);
  const sourcesReady = hasAllRenderSources(render, { ...sources, overlayInputs: sources.inputs });
  useEffect(() => {
    // 짤·워터마크는 높이 auto 로 그려진다. 선택 상자 높이를 맞추려고 그려진 요소의 비율(높이/폭)을 잰다.
    const stack = stackRef.current;
    if (!stack) return;
    const elements = () => [...stack.querySelectorAll<HTMLElement>("[data-u3-target]")];
    const measure = () => {
      const next: Record<string, number> = {};
      for (const element of elements()) {
        const id = element.dataset.u3Target;
        if (id && element.offsetWidth && element.offsetHeight) next[id] = element.offsetHeight / element.offsetWidth;
      }
      setMediaAspects((current) => Object.entries(next).every(([id, aspect]) => Math.abs((current[id] ?? 0) - aspect) < 1e-4) ? current : { ...current, ...next });
    };
    const resize = new ResizeObserver(measure);
    const observe = () => { for (const element of elements()) resize.observe(element); };
    const mutation = new MutationObserver(() => { observe(); measure(); });
    mutation.observe(stack, { childList: true, subtree: true });
    observe();
    measure();
    return () => { resize.disconnect(); mutation.disconnect(); };
  }, [sourcesReady]);
  useEffect(() => {
    let active = true;
    void api<BrandSettings>("GET", "/api/system/brand").then(async value => {
      const preview = value.watermark?.file ? { ...value, watermark: { ...value.watermark, file: await brandMediaUrl(value.watermark.file) } } : value;
      if (active) setBrand(preview);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      const [inputEntries, memeItems, fileEntries] = await Promise.all([
        Promise.all(props.project.inputs.map(async (input) => [input.id, await mediaUrl(props.project.id, input.file)] as const)),
        api<MemeSource[]>("GET", "/api/library/memes").catch(() => []),
        Promise.all(render.audio.filter((layer) => layer.file && !layer.file.startsWith("http")).map(async (layer) => [layer.file!, libraryReferencePath(layer.file!)
          ? await libraryMediaUrl(layer.file!)
          : await mediaUrl(props.project.id, layer.file!)] as const)),
      ]);
      if (!active) return;
      const memeById = new Map(memeItems.map((item) => [item.id, item.url]));
      const memeAspects = new Map(memeItems.flatMap((item) => item.width && item.height ? [[item.id, item.height / item.width] as const] : []));
      const referencedMemeIds = [
        ...render.video.filter((item) => item.kind === "meme").map((item) => item.memeId!),
        ...render.overlay.filter((item) => item.kind === "meme").map((item) => item.memeId!),
        ...render.audio.filter((item) => item.track === "meme").map((item) => item.inputId!),
      ];
      const missingMemeIds = [...new Set(referencedMemeIds)].filter((id) => !memeById.has(id));
      const extraMemes = await Promise.all(missingMemeIds.map(async (id) => {
        const matches = await api<MemeSource[]>("GET", `/api/library/memes?q=${encodeURIComponent(id)}`).catch(() => []);
        return matches.find((item) => item.id === id);
      }));
      if (!active) return;
      extraMemes.forEach((item) => {
        if (!item) return;
        memeById.set(item.id, item.url);
        if (item.width && item.height) memeAspects.set(item.id, item.height / item.width);
      });
      setSources({
        inputs: Object.fromEntries(inputEntries),
        memes: Object.fromEntries(memeById),
        memeAspects: Object.fromEntries(memeAspects),
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
    memeAspects: sources.memeAspects,
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
    <div ref={stackRef} className="studio-preview-stack">
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
    {targets.length ? <PreviewEditLayer targets={targets} selectedId={props.selectedId} safeZone={props.safeZone} titleBarHeight={titleBarHeight} onSelect={props.onSelectTarget} onPreview={previewTarget} onCommit={commitTarget} onDragStart={() => { if (props.playing) props.onPlaying(false); }} /> : props.safeZone ? <PreviewEditLayer targets={[]} selectedId={props.selectedId} safeZone titleBarHeight={titleBarHeight} onSelect={props.onSelectTarget} onPreview={previewTarget} onCommit={commitTarget} onDragStart={() => { if (props.playing) props.onPlaying(false); }} /> : null}
    </div>
  </div>;
}
