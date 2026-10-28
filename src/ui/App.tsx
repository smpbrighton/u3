import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { api, resetConnection } from "./api";
import { Video01Icon, CarouselHorizontalIcon, Settings02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { Home } from "./screens/Home";
import { Input } from "./screens/Input";
import { Script } from "./screens/Script";
import { Settings } from "./screens/Settings";
import { Studio } from "./screens/Studio";
import type { Project, SystemStatus } from "./types";
import { projectOpenScreen } from "./project-screen";
import { Carousels } from "./screens/Carousels";
import type { Carousel } from "../core/carousel";
import { DEFAULT_STUDIO_SHORTCUTS, type StudioShortcutTable } from "../core/studio-shortcuts";
import { RestartController, RestartSaves, checkUpdateNow, restartUpdate, subscribeUpdates, updateLine, updateReceiver, type UpdateSnapshot } from "./updater";
import { RestartSaveContext } from "./update-save";
import { Sidebar } from "./components/u3/Sidebar";
import { EngineConnectionBanner } from "./components/u3/EngineConnectionBanner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "./components/ui/alert-dialog";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

type Screen = "home" | "input" | "script" | "studio" | "settings" | "carousel";
type Connection = { port: number; token: string };
const APP_TOAST_ID = "u3-message";

const NAVIGATION = [
  { screen: "home" as Screen, label: "영상", icon: Video01Icon },
  { screen: "carousel" as Screen, label: "캐러셀", icon: CarouselHorizontalIcon },
  { screen: "settings" as Screen, label: "설정", icon: Settings02Icon },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [project, setProject] = useState<Project | null>(null);
  const [carouselToOpen, setCarouselToOpen] = useState<Carousel | null>(null);
  const openCarousel = useCallback((carousel: Carousel) => { setCarouselToOpen(carousel); setScreen("carousel"); }, []);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [shortcuts, setShortcuts] = useState<StudioShortcutTable>(DEFAULT_STUDIO_SHORTCUTS);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const notify = useCallback((message: string) => { toast(message, { id: APP_TOAST_ID, duration: 5000 }); }, []);
  const notifyError = useCallback((message: string) => { toast.error(message, { id: APP_TOAST_ID, duration: 5000 }); }, []);
  const [update, setUpdate] = useState<UpdateSnapshot | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [studioFromScript, setStudioFromScript] = useState(false);
  const [studioNotices, setStudioNotices] = useState<string[]>([]);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const saves = useRef(new RestartSaves()).current;
  const restart = useRef(new RestartController({ getBusy: () => api<{ busy: boolean }>("GET", "/api/system/busy"), saves, restart: restartUpdate })).current;
  const receiveUpdate = useRef(updateReceiver(setUpdate, notifyError)).current;

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void subscribeUpdates(status => { if (active) receiveUpdate(status); }).then(unsubscribe => {
      if (active) stop = unsubscribe; else unsubscribe();
    }).catch(reason => { if (active) notifyError(String(reason)); });
    return () => { active = false; stop?.(); };
  }, [receiveUpdate, notifyError]);

  async function requestRestart(confirmed = false) {
    if (restarting) return;
    setConfirmRestart(false);
    setRestarting(true);
    try {
      const result = await restart.request(confirmed);
      if (result === "confirm") setConfirmRestart(true);
      if (result !== "restarting") setRestarting(false);
    } catch {
      setRestarting(false);
      notifyError("다시 시작하지 못했어요");
    }
  }

  async function checkNow() {
    try { receiveUpdate(await checkUpdateNow()); }
    catch (reason) { notifyError(String(reason)); }
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setConnecting(true);
    resetConnection();
    const connect = async () => {
      try {
        const endpoint = isTauri()
          ? await invoke<Connection>("engine_connection")
          : { port: Number(import.meta.env.VITE_ENGINE_PORT), token: import.meta.env.VITE_ENGINE_TOKEN ?? "" };
        if (!endpoint.port || !endpoint.token) throw new Error("엔진 연결 정보가 없습니다. pnpm dev를 실행해 주세요.");
        if (!active) return;
        const nextStatus = await api<SystemStatus>("GET", "/api/system", undefined, controller.signal);
        if (!active) return;
        setConnection(endpoint);
        setStatus(nextStatus);
        setEngineError(null);
        void api<{ bindings: StudioShortcutTable }>("GET", "/api/system/studio-shortcuts", undefined, controller.signal)
          .then(({ bindings }) => { if (active) setShortcuts(bindings); })
          .catch(() => { if (active) setShortcuts(DEFAULT_STUDIO_SHORTCUTS); });
      } catch (reason) {
        if (active) {
          setConnection(null);
          setStatus(null);
          setEngineError(reason instanceof Error ? reason.message : String(reason));
        }
      } finally {
        if (active) setConnecting(false);
      }
    };
    void connect();
    return () => { active = false; controller.abort(); };
  }, [connectionAttempt]);

  const openProject = useCallback((next: Project) => {
    setProject(next);
    setStudioFromScript(false);
    setScreen(projectOpenScreen(next));
  }, []);

  const go = (target: Screen) => {
    if ((target === "input" || target === "script" || target === "studio") && !project) {
      notify("먼저 영상을 열어 주세요.");
      return;
    }
    setCarouselToOpen(null);
    if (target !== "studio") setStudioFromScript(false);
    setScreen(target);
  };

  const page = screen === "home" ? (
    <Home status={status} onNew={openProject} onOpen={openProject} onSettings={() => go("settings")} onCarouselCreated={openCarousel} />
  ) : screen === "input" && project ? (
    <Input project={project} onProject={setProject} onBack={() => go("home")} onNext={() => go("script")} onScript={() => go("script")} onStudio={() => go("studio")} onError={notifyError} />
  ) : screen === "script" && project ? (
    <Script project={project} status={status} onProject={setProject} onStudio={() => { setStudioFromScript(true); go("studio"); }} onBack={() => go("input")} onSnackbar={notify} onError={notifyError} onSettings={() => go("settings")} onNotices={setStudioNotices} />
  ) : screen === "studio" && project ? (
    <Studio project={project} shortcuts={shortcuts} onProject={setProject} onBack={() => go("script")} onSnackbar={notify} onError={notifyError} onCarouselCreated={openCarousel} initialTab={studioFromScript ? "scenes" : undefined} notifications={studioNotices} onOpenSettings={() => go("settings")} />
  ) : screen === "carousel" ? (
    <Carousels initialCarousel={carouselToOpen} onSnackbar={notify} onError={notifyError} onSettings={() => go("settings")} />
  ) : <Settings shortcuts={shortcuts} onShortcuts={setShortcuts} onSnackbar={notify} onError={notifyError} update={update} onCheckUpdate={() => void checkNow()} />;

  return (
    <RestartSaveContext.Provider value={saves}>
    <TooltipProvider>
    <Toaster />
    <div className="u3-shell flex h-screen min-h-0 w-full items-stretch overflow-hidden" data-engine-connected={Boolean(connection)} inert={restarting} aria-busy={restarting}>
      {screen !== "studio" || updateLine(update) ? <Sidebar items={NAVIGATION} current={screen === "input" || screen === "script" || screen === "studio" ? "home" : screen} onNavigate={go} update={update} restarting={restarting} onRestart={() => void requestRestart()} /> : null}
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {engineError && <div className="shrink-0 px-10 pt-7 pb-5"><EngineConnectionBanner error={engineError} connecting={connecting} onRetry={() => setConnectionAttempt(attempt => attempt + 1)} /></div>}
        {page}
      </main>
    </div>
    <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>작업을 중단하고 다시 시작할까요?</AlertDialogTitle>
          <AlertDialogDescription>진행 중인 작업이 중단돼요</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-1">
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction variant="solid" onClick={() => void requestRestart(true)}>저장하고 다시 시작</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {restarting && <div className="u3-shell fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3">
        <HugeiconsIcon icon={Loading03Icon} aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
        다시 시작하는 중
      </div>
    </div>}
    </TooltipProvider>
    </RestartSaveContext.Provider>
  );
}
