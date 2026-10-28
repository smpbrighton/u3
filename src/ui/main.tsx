import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initializeTheme } from "./theme-state";

const stopTheme = initializeTheme();
if (import.meta.hot) import.meta.hot.dispose(stopTheme);

const root = document.getElementById("root");
if (!root) throw new Error("#root 요소가 없습니다");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
