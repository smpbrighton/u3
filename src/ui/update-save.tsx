import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type { RestartSaves } from "./updater";

export const RestartSaveContext = createContext<RestartSaves | null>(null);

/** 화면의 현재 편집 상태를 기존 저장 경로로 저장한다. 실패는 다시 시작을 중단한다. */
export function useBeforeUpdateRestart(save: () => Promise<void>): void {
  const saves = useContext(RestartSaveContext);
  const latest = useRef(save);
  useLayoutEffect(() => { latest.current = save; });
  useLayoutEffect(() => saves?.register(() => latest.current()), [saves]);
}
