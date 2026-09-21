import { useEffect, useState } from "react";
import type { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import "@clientTheatre/styles/UploadCurtain.css";
interface UploadCurtainViewProperties {
    applicationController: ClientApplicationController;
}
function UploadCurtainView(properties: UploadCurtainViewProperties): React.JSX.Element {
    const curtainController = properties.applicationController.uploadCurtainController;
    const [, forceRender] = useState(0);
    useEffect(() => {
        return curtainController.subscribe(() => forceRender((renderCount) => renderCount + 1));
    }, [curtainController]);
    const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            curtainController.selectFile(selectedFile);
        }
    };
    const handleSubmit = () => {
        if (curtainController.selectedFile && curtainController.entryFileName.trim().length > 0) {
            void properties.applicationController.handleArchiveSubmission(
                curtainController.selectedFile,
                curtainController.entryFileName.trim(),
            );
        }
    };
    const submitDisabled =
        !curtainController.selectedFile ||
        curtainController.entryFileName.trim().length === 0 ||
        curtainController.isBuilding;
    return (
        <div className="upload-curtain">
            <label className="upload-dropzone">
                {curtainController.selectedFile
                    ? curtainController.selectedFile.name
                    : "Drop a zip archive here, or click to choose one."}
                <input type="file" accept=".zip" onChange={handleFileSelection} hidden />
            </label>
            <input
                className="upload-entry-input"
                type="text"
                placeholder="Entry file, e.g. main.py"
                value={curtainController.entryFileName}
                onChange={(event) => curtainController.setEntryFileName(event.target.value)}
            />
            <button
                className="upload-submit-button"
                onClick={handleSubmit}
                disabled={submitDisabled}
            >
                {curtainController.isBuilding ? "Building." : "Build and Run"}
            </button>
            {curtainController.errorMessage.length > 0 && (
                <div className="upload-error-message">{curtainController.errorMessage}</div>
            )}
        </div>
    );
}
export { UploadCurtainView };
