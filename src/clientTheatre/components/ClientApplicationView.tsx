import { useEffect, useRef, useState } from "react";
import { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import { UploadCurtainView } from "@clientTheatre/components/UploadCurtainView.tsx";
import { CodeProjectEditorView } from "@clientTheatre/components/CodeProjectEditorView.tsx";
import { TerminalStageView } from "@clientTheatre/components/TerminalStageView.tsx";
import { StatusRibbonView } from "@clientTheatre/components/StatusRibbonView.tsx";
import { MarqueeHeadingView } from "@clientTheatre/components/MarqueeHeadingView.tsx";
import { SiteFooterView } from "@clientTheatre/components/SiteFooterView.tsx";
import { LanguageGalleryView } from "@clientTheatre/components/LanguageGalleryView.tsx";
import { CompatibilityMatrixView } from "@clientTheatre/components/CompatibilityMatrixView.tsx";
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
    const finishedSession = showsTerminalStage ? applicationController.activeSession : undefined;
    const isFinished = applicationController.currentState === "finished";
    return (
        <div className="universal-application-column">
            <MarqueeHeadingView />
            {showsTerminalStage ? (
                <TerminalStageView
                    terminalStageController={applicationController.terminalStageController}
                />
            ) : (
                <>
                    <UploadCurtainView applicationController={applicationController} />
                    <CodeProjectEditorView applicationController={applicationController} />
                    <LanguageGalleryView applicationController={applicationController} />
                    <CompatibilityMatrixView />
                </>
            )}
            {(finishedSession || isFinished) && (
                <div className="session-action-row">
                    {finishedSession && (
                        <a
                            className="static-export-link"
                            href={applicationController.backendApiClient.constructStaticExportUrl(
                                finishedSession.sessionIdentifier,
                            )}
                            download
                        >
                            Download static site
                        </a>
                    )}
                    {finishedSession && (
                        <a
                            className="static-export-link"
                            href={applicationController.backendApiClient.constructSingleFileExportUrl(
                                finishedSession.sessionIdentifier,
                            )}
                            download
                        >
                            Download single file
                        </a>
                    )}
                    {isFinished && (
                        <button
                            className="run-another-button"
                            type="button"
                            onClick={() => applicationController.beginAnotherRun()}
                        >
                            Run another
                        </button>
                    )}
                </div>
            )}
            <StatusRibbonView
                statusRibbonController={applicationController.statusRibbonController}
            />
            <SiteFooterView />
        </div>
    );
}
export { ClientApplicationView };
