import { useEffect, useRef, useState } from "react";
import { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import { UploadCurtainView } from "@clientTheatre/components/UploadCurtainView.tsx";
import { TerminalStageView } from "@clientTheatre/components/TerminalStageView.tsx";
import { StatusRibbonView } from "@clientTheatre/components/StatusRibbonView.tsx";
import { MarqueeHeadingView } from "@clientTheatre/components/MarqueeHeadingView.tsx";
function ClientApplicationView(): React.JSX.Element {
    const controllerReference = useRef<ClientApplicationController | null>(null);
    if (!controllerReference.current) {
        controllerReference.current = new ClientApplicationController();
    }
    const applicationController = controllerReference.current;
    const [, forceRender] = useState(0);
    useEffect(() => {
        return applicationController.subscribe(() => forceRender((renderCount) => renderCount + 1));
    }, [applicationController]);
    const showsTerminalStage =
        applicationController.currentState === "performing" ||
        applicationController.currentState === "finished";
    const finishedSession =
        applicationController.currentState === "finished"
            ? applicationController.activeSession
            : undefined;
    return (
        <div className="universal-application-column">
            <MarqueeHeadingView />
            {showsTerminalStage ? (
                <TerminalStageView
                    terminalStageController={applicationController.terminalStageController}
                />
            ) : (
                <UploadCurtainView applicationController={applicationController} />
            )}
            {finishedSession && (
                <a
                    className="static-export-link"
                    href={applicationController.backendApiClient.constructStaticExportUrl(
                        finishedSession.sessionIdentifier,
                    )}
                    download
                >
                    Download static site (.zip)
                </a>
            )}
            <StatusRibbonView
                statusRibbonController={applicationController.statusRibbonController}
            />
        </div>
    );
}
export { ClientApplicationView };
