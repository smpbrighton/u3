import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import type { SystemStatus } from "../../types";
import { CODEX_MIN_VERSION } from "../../../core/codex-model";

export function codexWarningMessage(status: SystemStatus | null): string | null {
  if (!status) return null;
  if (!status.codex.installed) return "codex 를 찾지 못했어요";
  if (status.codex.outdated) return `codex 업데이트가 필요해요 (현재 ${status.codex.version ?? "확인 불가"}, ${CODEX_MIN_VERSION} 이상 필요)`;
  return status.codex.loggedIn ? null : "codex 로그인이 필요해요";
}

export function CodexWarning({ status, onSettings }: { status: SystemStatus | null; onSettings?: () => void }) {
  const message = codexWarningMessage(status);
  if (!message) return null;
  return <Alert className="flex items-center gap-2.5 px-3 py-2.5">
    <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    <span className="min-w-0 flex-1 text-sm font-bold">{message}</span>
    <Button variant="outline" size="sm" disabled={!onSettings} onClick={onSettings}>설정 열기</Button>
  </Alert>;
}
