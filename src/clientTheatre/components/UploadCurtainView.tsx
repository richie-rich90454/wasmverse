import { useEffect, useState } from "react";
import type { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import "@clientTheatre/styles/UploadCurtain.css";
interface UploadCurtainViewProperties {
    applicationController: ClientApplicationController;
}
function UploadCurtainView(properties: UploadCurtainViewProperties): React.JSX.Element {
    const curtainController = properties.applicationController.uploadCurtainController;
    const [, forceRender] = useState(0);
    const [isDragActive, setIsDragActive] = useState(false);
    useEffect(() => {
        return curtainController.subscribe(() => forceRender((renderCount) => renderCount + 1));
    }, [curtainController]);
    const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        if (selectedFile) {
            void curtainController.selectFile(selectedFile);
        }
    };
    const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setIsDragActive(true);
    };
    const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setIsDragActive(false);
    };
    const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        setIsDragActive(false);
        const droppedFile = event.dataTransfer.files?.[0];
        if (droppedFile) {
            void curtainController.selectFile(droppedFile);
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
    const hasEntryListing = curtainController.entryFileOptions.length > 0;
    const submitDisabled =
        !curtainController.selectedFile ||
        curtainController.entryFileName.trim().length === 0 ||
        curtainController.isBuilding;
    const buttonLabel =
        curtainController.phase === "uploading"
            ? "Uploading"
            : curtainController.phase === "building"
              ? "Building"
              : "Build and Run";
    return (
        <div className="upload-curtain">
            <label
                className={`upload-dropzone${isDragActive ? " upload-dropzone-active" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {curtainController.selectedFile
                    ? `${curtainController.selectedFile.name} (${curtainController.entryFileOptions.length} files detected)`
                    : "Drop a zip archive here, or select one from your computer."}
                <input type="file" accept=".zip" onChange={handleFileSelection} hidden />
            </label>
            <label className="upload-entry-label" htmlFor="upload-entry-select">
                ENTRY FILE
            </label>
            {hasEntryListing ? (
                <select
                    id="upload-entry-select"
                    className="upload-entry-input"
                    value={curtainController.entryFileName}
                    onChange={(event) => curtainController.setEntryFileName(event.target.value)}
                >
                    {curtainController.entryFileOptions.map((optionPath) => (
                        <option key={optionPath} value={optionPath}>
                            {optionPath}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    id="upload-entry-select"
                    className="upload-entry-input"
                    type="text"
                    placeholder="Entry file, for example main.py"
                    value={curtainController.entryFileName}
                    onChange={(event) => curtainController.setEntryFileName(event.target.value)}
                />
            )}
            <button
                className="upload-submit-button"
                onClick={handleSubmit}
                disabled={submitDisabled}
            >
                {buttonLabel}
            </button>
            {curtainController.errorMessage.length > 0 && (
                <div className="upload-error-message" role="alert">
                    {curtainController.errorMessage}
                </div>
            )}
        </div>
    );
}
export { UploadCurtainView };
