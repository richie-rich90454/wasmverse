import { createRoot } from "react-dom/client";
import { ClientApplicationView } from "@clientTheatre/components/ClientApplicationView.tsx";
import "@clientTheatre/styles/UniversalBlueprint.css";
const rootElement = document.getElementById("root");
if (rootElement) {
    createRoot(rootElement).render(<ClientApplicationView />);
}
