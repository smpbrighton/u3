import { useCallback, useEffect, useState } from "react";
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

type Screen = "home" | "input" | "script" | "studio" | "settings" | "carousel";
type Connection = { port: number; token: string };

const NAVIGATION = [
  { screen: "home" as Screen, label: "영상", icon: Video01Icon },
  { screen: "carousel" as Screen, label: "캐러셀", icon: CarouselHorizontalIcon, badge: "준비 중" },
  { screen: "settings" as Screen, label: "설정", icon: Settings02Icon },
];

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

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

  useEffect(() => {
    if (!snackbar) return;
    const timeout = window.setTimeout(() => setSnackbar(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

  const openProject = useCallback((next: Project) => {
    setProject(next);
    setScreen("input");
    setError(null);
  }, []);

  const go = (target: Screen) => {
    if ((target === "input" || target === "script" || target === "studio") && !project) {
      setSnackbar("먼저 영상을 열어 주세요.");
      return;
    }
    setScreen(target);
    setError(null);
  };

  const page = screen === "home" ? (
    <Home status={status} onNew={openProject} onOpen={openProject} onSettings={() => go("settings")} />
  ) : screen === "input" && project ? (
    <Input project={project} onProject={setProject} onBack={() => go("home")} onNext={() => go("script")} onError={setSnackbar} />
  ) : screen === "script" && project ? (
    <Script project={project} status={status} onProject={setProject} onStudio={() => go("studio")} onBack={() => go("input")} onSnackbar={setSnackbar} onError={setSnackbar} />
  ) : screen === "studio" && project ? (
    <Studio project={project} onProject={setProject} onBack={() => go("script")} onSnackbar={setSnackbar} onError={setSnackbar} />
  ) : screen === "carousel" ? (
    <section className="screen" aria-labelledby="carousel-title"><h1 id="carousel-title" className="screen-title">캐러셀</h1><div className="empty-state">캐러셀은 준비 중이에요</div></section>
  ) : <Settings onSnackbar={setSnackbar} onError={setSnackbar} />;

  return (
    <div className={`app-shell${screen === "studio" ? " app-shell--studio" : ""}`} data-engine-connected={Boolean(connection)}>
      <nav className="sidebar" aria-label="주 메뉴">
        <p className="brand">U3</p>
        {NAVIGATION.map(item => (
          <button key={item.screen} className="nav-button" aria-current={(item.screen === "home" ? screen === "home" : screen === item.screen) ? "page" : undefined} onClick={() => go(item.screen)}>
            <span className="nav-icon" aria-hidden="true"><HugeiconsIcon icon={item.icon} size={20} /></span>{item.label}{"badge" in item ? <span className="nav-badge">{item.badge}</span> : null}
          </button>
        ))}
      </nav>
      <main className="main-column">
        {error ? <div className="page-banner-wrap" role="alert"><PageBanner tone="warning" variant="weak" description={`엔진에 연결하지 못했어요. ${error}`} /></div> : null}
        {page}
      </main>
      {snackbar ? <div className="snackbar" role="status">{snackbar}</div> : null}
    </div>
  );
}
