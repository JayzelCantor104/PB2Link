import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
// Sets axios defaults (withCredentials) and the 401/403 -> re-login
// interceptor. Imported for its side effects; must load before any request.
import "./lib/apiClient";
import "./styles/style.css";
import "./styles/index.css";
import "./styles/includes/style.css";
import "./styles/includes/auth.css";
import "./styles/header.css";
import "./styles/footer.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
