import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const syncAppHeight = () => {
    const footer = document.querySelector('[data-app-footer="true"]');
    const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty(
        "--app-height",
        `${window.innerHeight - footerHeight}px`,
    );
};

syncAppHeight();
window.addEventListener("resize", syncAppHeight);
window.visualViewport?.addEventListener("resize", syncAppHeight);

const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("Root element not found");
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
