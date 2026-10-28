import { DEFAULT_STUDIO_SHORTCUTS, STUDIO_ACTIONS, formatChord, type Platform, type StudioShortcutTable } from "../../core/studio-shortcuts";
import { uiPlatform } from "../platform";

export function ShortcutList({ shortcuts = DEFAULT_STUDIO_SHORTCUTS, platform = uiPlatform() }: { shortcuts?: StudioShortcutTable; platform?: Platform }) {
  return <dl className="grid gap-2 text-xs">
    {STUDIO_ACTIONS.map(({ id, label }) => <div key={id} className="flex items-center justify-between gap-6">
      <dt>{label}</dt><dd className="font-medium tabular-nums">{formatChord(shortcuts[id], platform)}</dd>
    </div>)}
  </dl>;
}
