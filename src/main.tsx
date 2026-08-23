import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Application root is missing.");
}

if (window.self !== window.top) {
  rootElement.setAttribute("role", "alert");
  rootElement.textContent =
    "보안을 위해 이 사이트는 다른 페이지 안에서 실행할 수 없습니다.";
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
