import { createRoot } from "react-dom/client";
import { ClientApplicationView } from "@clientTheatre/components/ClientApplicationView.tsx";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/eb-garamond/600.css";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/600.css";
import "@clientTheatre/styles/UniversalBlueprint.css";
const rootElement = document.getElementById("root");
if (rootElement) {
    createRoot(rootElement).render(<ClientApplicationView />);
}
