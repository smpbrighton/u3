import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import type { SystemStatus } from "../../types";

export function CodexWarning({ status, onSettings }: { status: SystemStatus | null; onSettings?: () => void }) {
  const message = status && !status.codex.installed ? "codex 설치가 필요해요"
    : status && !status.codex.loggedIn ? "codex 로그인이 필요해요" : null;
  if (!message) return null;
  return <Alert className="flex items-center gap-2.5 px-3 py-2.5">
    <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    <span className="min-w-0 flex-1 text-sm font-bold">{message}</span>
    <Button variant="outline" size="sm" disabled={!onSettings} onClick={onSettings}>설정 열기</Button>
  </Alert>;
}
