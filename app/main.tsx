import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { GobangGame } from "@/modules/gobang/components/gobang-game";
import { registerServiceWorker } from "@/pwa";

import "./app.css";

const rootElement: HTMLElement | null = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <GobangGame />
  </StrictMode>
);

registerServiceWorker();
