import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
// Sets axios defaults (withCredentials) and the 401/403 -> re-login
// interceptor. Imported for its side effects; must load before any request.
import "./lib/apiClient";
// Keeps the emergency page and its public data on the phone (public/sw.js).
import { registerServiceWorker } from "./lib/offline";
import "./styles/style.css";
import "./styles/index.css";
import "./styles/includes/style.css";
import "./styles/includes/auth.css";
import "./styles/header.css";
import "./styles/footer.css";
// Accessibility basics (focus outline, skip link, reduced motion): loaded last so they win.
import "./styles/a11y.css";
// Dialogs: focus in, Tab kept inside, Escape closes, focus returns (WCAG 2.1.2, 2.4.3).
import { installDialogA11y } from "./lib/dialogA11y";
// The visitor's Accessibility menu choices, applied before the first render.
import { applyStoredPrefs } from "./lib/a11yPrefs";

registerServiceWorker();
installDialogA11y();
applyStoredPrefs();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
