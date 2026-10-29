import { createContext } from "react";

export const HistoryGestureContext = createContext<{ begin(): void; end(): void } | null>(null);
