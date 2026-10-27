import { ActionButton } from "../../seed-design/ui/action-button";
import { updateLine, type UpdateSnapshot } from "./updater";

export function UpdateSidebar(props: { status: UpdateSnapshot | null; disabled: boolean; onRestart: () => void }) {
  const line = updateLine(props.status);
  if (!line) return null;
  return <div className="update-status" role="status"><span>{line}</span>{props.status?.status === "ready" ? <><span aria-hidden="true"> · </span><ActionButton variant="ghost" size="small" disabled={props.disabled} onClick={props.onRestart}>다시 시작</ActionButton></> : null}</div>;
}

export function AppInfo(props: { status: UpdateSnapshot | null; onCheck: () => void }) {
  return <section className="section-card settings-card" aria-labelledby="app-info-title">
    <h2 id="app-info-title" className="settings-section-title">앱 정보</h2>
    <dl className="app-info"><div><dt>현재 버전</dt><dd>{props.status?.currentVersion ?? "—"}</dd></div><div><dt>마지막 확인</dt><dd>{props.status?.lastCheckedAt ? <time dateTime={new Date(props.status.lastCheckedAt).toISOString()}>{new Date(props.status.lastCheckedAt).toLocaleString("ko-KR")}</time> : "아직 확인하지 않았어요"}</dd></div></dl>
    <div className="action-row"><ActionButton variant="neutralWeak" disabled={!props.status || props.status.checking} onClick={props.onCheck}>지금 확인</ActionButton></div>
  </section>;
}
