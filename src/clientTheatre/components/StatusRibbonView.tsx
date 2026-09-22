import { useEffect, useState } from "react";
import type { StatusRibbonController } from "@clientTheatre/services/StatusRibbonController.ts";
import "@clientTheatre/styles/StatusRibbon.css";
interface StatusRibbonViewProperties {
    statusRibbonController: StatusRibbonController;
}
function StatusRibbonView(properties: StatusRibbonViewProperties): React.JSX.Element | null {
    const [, forceRender] = useState(0);
    useEffect(() => {
        return properties.statusRibbonController.subscribe(() =>
            forceRender((renderCount) => renderCount + 1),
        );
    }, [properties.statusRibbonController]);
    const messageText = properties.statusRibbonController.messageText;
    if (messageText.trim().length === 0) {
        return null;
    }
    return (
        <div
            className={`status-ribbon status-ribbon-${properties.statusRibbonController.messageKind}`}
            role="status"
            aria-live="polite"
        >
            {messageText}
        </div>
    );
}
export { StatusRibbonView };
