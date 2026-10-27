import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { api } from "./api";
import { Video01Icon, CarouselHorizontalIcon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Home } from "./screens/Home";
import { Input } from "./screens/Input";
import { Script } from "./screens/Script";
import { Settings } from "./screens/Settings";
import { PageBanner } from "../../seed-design/ui/page-banner";
import { Studio } from "./screens/Studio";
import type { Project, SystemStatus } from "./types";
import { projectOpenScreen } from "./project-screen";
import { ActionButton } from "../../seed-design/ui/action-button";
import { SideNavigationProvider, SideNavigationRoot, SideNavigationHeader, SideNavigationContent, SideNavigationGroup } from "../../seed-design/ui/side-navigation";
import { SnackbarProvider, Snackbar, useSnackbarAdapter } from "../../seed-design/ui/snackbar";
import { Carousels } from "./screens/Carousels";
import type { Carousel } from "../core/carousel";
import { RestartController, RestartSaves, checkUpdateNow, restartUpdate, subscribeUpdates, updateReceiver, type UpdateSnapshot } from "./updater";
import { RestartSaveContext } from "./update-save";
import { UpdateSidebar } from "./UpdateControls";
import { AlertDialogRoot, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "../../seed-design/ui/alert-dialog";

type Screen = "home" | "input" | "script" | "studio" | "settings" | "carousel";
type Connection = { port: number; token: string };

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
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const dismissSnackbar = useCallback(() => setSnackbar(null), []);
  const [update, setUpdate] = useState<UpdateSnapshot | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const saves = useRef(new RestartSaves()).current;
  const restart = useRef(new RestartController({ getBusy: () => api<{ busy: boolean }>("GET", "/api/system/busy"), saves, restart: restartUpdate })).current;
  const receiveUpdate = useRef(updateReceiver(setUpdate, setSnackbar)).current;

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void subscribeUpdates(status => { if (active) receiveUpdate(status); }).then(unsubscribe => {
      if (active) stop = unsubscribe; else unsubscribe();
    }).catch(reason => { if (active) setSnackbar(String(reason)); });
    return () => { active = false; stop?.(); };
  }, [receiveUpdate]);

  async function requestRestart(confirmed = false) {
    if (restarting) return;
    setConfirmRestart(false);
    setRestarting(true);
    try {
      const result = await restart.request(confirmed);
      if (result === "confirm") setConfirmRestart(true);
      if (result !== "restarting") setRestarting(false);
    } catch (reason) {
      setRestarting(false);
      setSnackbar(`다시 시작하지 못했어요. ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }

  async function checkNow() {
    try { receiveUpdate(await checkUpdateNow()); }
    catch (reason) { setSnackbar(String(reason)); }
  }

  useEffect(() => {
    let active = true;
    const connect = async () => {
      try {
        const endpoint = isTauri()
          ? await invoke<Connection>("engine_connection")
          : { port: Number(import.meta.env.VITE_ENGINE_PORT), token: import.meta.env.VITE_ENGINE_TOKEN ?? "" };
        if (!endpoint.port || !endpoint.token) throw new Error("엔진 연결 정보가 없습니다. pnpm dev를 실행해 주세요.");
        if (!active) return;
        setConnection(endpoint);
        setStatus(await api<SystemStatus>("GET", "/api/system"));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void connect();
    return () => { active = false; };
  }, []);

  const openProject = useCallback((next: Project) => {
    setProject(next);
    setScreen(projectOpenScreen(next));
    setError(null);
  }, []);

  const go = (target: Screen) => {
    if ((target === "input" || target === "script" || target === "studio") && !project) {
      setSnackbar("먼저 영상을 열어 주세요.");
      return;
    }
    setCarouselToOpen(null);
    setScreen(target);
    setError(null);
  };

  const page = screen === "home" ? (
    <Home status={status} onNew={openProject} onOpen={openProject} onSettings={() => go("settings")} onCarouselCreated={openCarousel} />
  ) : screen === "input" && project ? (
    <Input project={project} onProject={setProject} onBack={() => go("home")} onNext={() => go("script")} onScript={() => go("script")} onStudio={() => go("studio")} onError={setSnackbar} />
  ) : screen === "script" && project ? (
    <Script project={project} status={status} onProject={setProject} onStudio={() => go("studio")} onBack={() => go("input")} onSnackbar={setSnackbar} onError={setSnackbar} />
  ) : screen === "studio" && project ? (
    <Studio project={project} onProject={setProject} onBack={() => go("script")} onSnackbar={setSnackbar} onError={setSnackbar} onCarouselCreated={openCarousel} />
  ) : screen === "carousel" ? (
    <Carousels initialCarousel={carouselToOpen} onSnackbar={setSnackbar} onError={setSnackbar} />
  ) : <Settings onSnackbar={setSnackbar} onError={setSnackbar} update={update} onCheckUpdate={() => void checkNow()} />;

  return (
    <SnackbarProvider>
    <RestartSaveContext.Provider value={saves}>
    <div className={`app-shell${screen === "studio" ? " app-shell--studio" : ""}`} data-engine-connected={Boolean(connection)} inert={restarting} aria-busy={restarting}>
      <SideNavigationProvider>
        <SideNavigationRoot className="sidebar" aria-label="주 메뉴">
          <SideNavigationHeader><p className="brand">U3</p></SideNavigationHeader>
          <SideNavigationContent><SideNavigationGroup items={NAVIGATION.map(item => ({ key: item.screen, label: item.label, prefixIcon: <HugeiconsIcon icon={item.icon} size={20} />, current: (item.screen === "home" ? screen === "home" : screen === item.screen), onClick: () => go(item.screen) }))} /></SideNavigationContent>
          <UpdateSidebar status={update} disabled={restarting} onRestart={() => void requestRestart()} />
        </SideNavigationRoot>
      </SideNavigationProvider>
      <main className="main-column">
        {error ? <div className="page-banner-wrap" role="alert"><PageBanner tone="warning" variant="weak" description={`엔진에 연결하지 못했어요. ${error}`} /></div> : null}
        {page}
      </main>
      <SnackbarPresenter message={snackbar} onClose={dismissSnackbar} />
    </div>
    <AlertDialogRoot open={confirmRestart} onOpenChange={setConfirmRestart}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>작업을 중단하고 다시 시작할까요?</AlertDialogTitle><AlertDialogDescription>진행 중인 생성·렌더·받아 적기·음성 분리·모델 받기 작업이 중단돼요. 편집 중인 프로젝트를 저장한 뒤 다시 시작해요.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><ActionButton variant="neutralWeak" onClick={() => setConfirmRestart(false)}>취소</ActionButton><ActionButton variant="brandSolid" onClick={() => void requestRestart(true)}>저장하고 다시 시작</ActionButton></AlertDialogFooter></AlertDialogContent></AlertDialogRoot>
    </RestartSaveContext.Provider>
    </SnackbarProvider>
  );
}

function SnackbarPresenter(props: { message: string | null; onClose: () => void }) {
  const adapter = useSnackbarAdapter();
  useEffect(() => {
    if (!props.message) return;
    adapter.create({ timeout: 5000, onClose: props.onClose, render: () => <Snackbar message={props.message!} /> });
  }, [adapter, props.message, props.onClose]);
  return null;
}
