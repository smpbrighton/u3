import type { Timeline } from "../schema";

export const HISTORY_LIMIT = 100;

export interface TimelineHistory {
  past: Timeline[];
  present: Timeline;
  future: Timeline[];
}

function snapshot(timeline: Timeline): Timeline {
  return structuredClone(timeline);
}

export function createHistory(initial: Timeline): TimelineHistory {
  return { past: [], present: snapshot(initial), future: [] };
}

export function pushHistory(history: TimelineHistory, next: Timeline): TimelineHistory {
  const past = [...history.past, snapshot(history.present)].slice(-HISTORY_LIMIT);
  return { past, present: snapshot(next), future: [] };
}

export function replacePresent(history: TimelineHistory, next: Timeline): TimelineHistory {
  return { past: history.past, present: snapshot(next), future: [] };
}

export function undo(history: TimelineHistory): TimelineHistory {
  if (!history.past.length) return { past: [...history.past], present: snapshot(history.present), future: history.future.map(snapshot) };
  const previous = history.past.at(-1)!;
  return { past: history.past.slice(0, -1), present: snapshot(previous), future: [snapshot(history.present), ...history.future] };
}

export function redo(history: TimelineHistory): TimelineHistory {
  if (!history.future.length) return { past: [...history.past], present: snapshot(history.present), future: [...history.future] };
  const [next, ...future] = history.future;
  return { past: [...history.past, snapshot(history.present)].slice(-HISTORY_LIMIT), present: snapshot(next!), future };
}
