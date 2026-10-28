import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { DEFAULT_STUDIO_SHORTCUTS, STUDIO_ACTIONS, formatChord, normalizeChord, shortcutConflict, type ShortcutConflict, type StudioAction, type StudioShortcutTable } from "../../core/studio-shortcuts";
import { ApiError, api } from "../api";
import { uiPlatform } from "../platform";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { SettingRow, SettingsGroup } from "./SettingsControls";
import type { SettingsSaves } from "./settings-save";

function conflictMessage(conflict: ShortcutConflict): string {
  return conflict.kind === "action" ? `${STUDIO_ACTIONS.find(action => action.id === conflict.id)!.label}에서 사용 중이에요`
    : conflict.kind === "text" ? "글 편집에 사용하는 조합이에요" : "시스템에서 사용하는 조합이에요";
}

export function ShortcutSettings(props: { shortcuts?: StudioShortcutTable; onShortcuts?: (bindings: StudioShortcutTable) => void; saves: SettingsSaves }) {
  const [bindings, setBindings] = useState(props.shortcuts ?? DEFAULT_STUDIO_SHORTCUTS);
  const bindingsRef = useRef(bindings);
  const [recording, setRecording] = useState<StudioAction | null>(null);
  const recordingRef = useRef<StudioAction | null>(null);
  const [errors, setErrors] = useState<Partial<Record<StudioAction, string>>>({});
  const platform = uiPlatform();

  useEffect(() => {
    if (props.shortcuts) { bindingsRef.current = props.shortcuts; setBindings(props.shortcuts); }
  }, [props.shortcuts]);

  function errorFor(id: StudioAction, message?: string) {
    setErrors(current => ({ ...current, [id]: message }));
  }

  function save(id: StudioAction, chord: string) {
    const conflict = shortcutConflict(bindingsRef.current, id, chord, platform);
    if (conflict) { errorFor(id, conflictMessage(conflict)); return; }
    errorFor(id);
    void props.saves.run("studio-shortcuts", async () => {
      // 앞선 저장의 응답을 합쳐서 다른 행의 변경을 보존한다.
      const conflict = shortcutConflict(bindingsRef.current, id, chord, platform);
      if (conflict) throw new Error(conflictMessage(conflict));
      const next = { ...bindingsRef.current, [id]: chord };
      const { bindings: saved } = await api<{ bindings: StudioShortcutTable }>("PUT", "/api/system/studio-shortcuts", next);
      bindingsRef.current = saved;
      setBindings(saved);
      props.onShortcuts?.(saved);
      errorFor(id);
    }).catch(reason => {
      const action = reason instanceof ApiError && STUDIO_ACTIONS.some(action => action.id === reason.details.action) ? reason.details.action as StudioAction : id;
      errorFor(action, reason instanceof Error ? reason.message : String(reason));
    });
  }

  function cancelRecording() { recordingRef.current = null; setRecording(null); }

  function record(id: StudioAction, event: KeyboardEvent<HTMLInputElement>) {
    if (recordingRef.current !== id) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { cancelRecording(); event.currentTarget.blur(); return; }
    if (event.repeat) return;
    const chord = normalizeChord(event, platform);
    if (!chord) return;
    cancelRecording();
    event.currentTarget.blur();
    save(id, chord);
  }

  return <SettingsGroup title="단축키">
    {STUDIO_ACTIONS.map(({ id, label }) => <div key={id}>
      <SettingRow label={label} htmlFor={`shortcut-${id}`}>
        <Input id={`shortcut-${id}`} readOnly value={recording === id ? "키 입력 중" : formatChord(bindings[id], platform)}
          aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `shortcut-${id}-error` : undefined}
          onFocus={() => { recordingRef.current = id; setRecording(id); errorFor(id); }} onBlur={cancelRecording}
          onKeyDown={event => record(id, event)} className="h-7 w-40 text-xs" />
        <Button variant="ghost" size="sm" disabled={bindings[id] === DEFAULT_STUDIO_SHORTCUTS[id]} onClick={() => save(id, DEFAULT_STUDIO_SHORTCUTS[id])}>기본값으로</Button>
      </SettingRow>
      {errors[id] && <p id={`shortcut-${id}-error`} role="alert" className="py-1 text-xs text-destructive">{errors[id]}</p>}
    </div>)}
  </SettingsGroup>;
}
