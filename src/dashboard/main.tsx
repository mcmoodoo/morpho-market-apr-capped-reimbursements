import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";
import { App } from "./App";

function showError(err: unknown) {
  const root = document.getElementById("root");
  if (!root) return;
  const msg = err instanceof Error ? err.message : String(err);
  root.innerHTML = `<div style="padding:1.5rem;font-family:system-ui;max-width:600px;margin:0 auto;">
    <h2 style="color:#c00;">Dashboard error</h2>
    <pre style="background:#f5f5f5;padding:1rem;overflow:auto;font-size:13px;">${msg}</pre>
    <p style="color:#666;margin-top:1rem;">Open the console (F12). Ensure the API is running: bun run api</p>
  </div>`;
}

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root");
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} catch (err) {
  showError(err);
}
