import { useState } from "react";
import type { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import "@clientTheatre/styles/ProjectAuthoring.css";
interface SingleFilePasteViewProperties {
    applicationController: ClientApplicationController;
}
function SingleFilePasteView(properties: SingleFilePasteViewProperties): React.JSX.Element {
    const applicationController = properties.applicationController;
    const [fileName, setFileName] = useState("");
    const [sourceText, setSourceText] = useState("");
    const submissionInFlight =
        applicationController.currentState === "uploading" ||
        applicationController.currentState === "building";
    const canRun =
        fileName.trim().length > 0 && sourceText.trim().length > 0 && !submissionInFlight;
    const handleRun = () => {
        if (canRun) {
            void applicationController.handlePastedSourceSubmission(fileName, sourceText);
        }
    };
    return (
        <article className="quick-path-panel">
            <h3 className="quick-path-heading">Paste a Single File</h3>
            <p className="quick-path-support">
                Name the file, paste the source, and run it directly.
            </p>
            <label className="quick-path-label" htmlFor="paste-file-name">
                FILE NAME
            </label>
            <input
                id="paste-file-name"
                className="quick-path-input"
                type="text"
                placeholder="main.py"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
            />
            <label className="quick-path-label" htmlFor="paste-source-text">
                SOURCE
            </label>
            <textarea
                id="paste-source-text"
                className="quick-path-textarea"
                rows={8}
                spellCheck={false}
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
            />
            <button
                className="project-action-button quick-path-run-button"
                type="button"
                disabled={!canRun}
                onClick={handleRun}
            >
                Run file
            </button>
        </article>
    );
}
export { SingleFilePasteView };
