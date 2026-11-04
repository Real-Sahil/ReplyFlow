import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import App from "./App.tsx";
import { installScreenTransitions } from "../src/lib/screenTransitions";

installScreenTransitions();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
