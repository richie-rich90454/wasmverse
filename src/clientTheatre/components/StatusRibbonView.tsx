import { useEffect, useState } from "react";
import type { StatusRibbonController } from "@clientTheatre/services/StatusRibbonController.ts";
import "@clientTheatre/styles/StatusRibbon.css";
interface StatusRibbonViewProperties {
    statusRibbonController: StatusRibbonController;
}
function StatusRibbonView(properties: StatusRibbonViewProperties): React.JSX.Element {
    const [, forceRender] = useState(0);
    useEffect(() => {
        return properties.statusRibbonController.subscribe(() =>
            forceRender((renderCount) => renderCount + 1),
        );
    }, [properties.statusRibbonController]);
    return (
        <div
            className={`status-ribbon status-ribbon-${properties.statusRibbonController.messageKind}`}
        >
            {properties.statusRibbonController.messageText}
        </div>
    );
}
export { StatusRibbonView };
