import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";

export function EngineConnectionBanner({ error, connecting, onRetry }: { error: string; connecting: boolean; onRetry: () => void }) {
  return (
    <Alert className="flex h-11 shrink-0 items-center gap-2.5 rounded-lg py-0 pr-2 pl-3.5 [&>svg]:text-u3-danger-text">
      <HugeiconsIcon icon={Alert02Icon} aria-hidden="true" className="size-4 shrink-0 text-u3-danger-text" />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <strong className="shrink-0 text-sm">엔진에 연결하지 못했어요</strong>
        <span className="truncate text-xs text-muted-foreground" title={error}>{error}</span>
      </div>
      <Button variant="outline" size="sm" disabled={connecting} aria-busy={connecting} onClick={onRetry}>
        <HugeiconsIcon icon={RefreshIcon} aria-hidden="true" className="size-4" />
        다시 연결
      </Button>
    </Alert>
  );
}
