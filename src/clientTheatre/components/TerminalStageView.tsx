import { useEffect, useRef } from "react";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import "@clientTheatre/styles/TerminalStage.css";
import "@xterm/xterm/css/xterm.css";
interface TerminalStageViewProperties {
    terminalStageController: TerminalStageController;
}
function TerminalStageView(properties: TerminalStageViewProperties): React.JSX.Element {
    const containerReference = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const containerElement = containerReference.current;
        if (containerElement) {
            properties.terminalStageController.mountInto(containerElement);
            properties.terminalStageController.focusStage();
        }
        return () => {
            properties.terminalStageController.dispose();
        };
    }, [properties.terminalStageController]);
    return <div className="terminal-stage" ref={containerReference} />;
}
export { TerminalStageView };
