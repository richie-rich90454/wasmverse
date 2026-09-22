import { useState } from "react";
import type { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import { SAMPLE_PLATES, buildSampleArchive } from "@clientTheatre/services/SamplesCatalog.ts";
import "@clientTheatre/styles/LanguageGallery.css";
interface LanguageGalleryViewProperties {
    applicationController: ClientApplicationController;
}
function LanguageGalleryView(properties: LanguageGalleryViewProperties): React.JSX.Element {
    const [activeEntryFileName, setActiveEntryFileName] = useState("");
    const submissionInFlight =
        properties.applicationController.currentState === "uploading" ||
        properties.applicationController.currentState === "building";
    const handleRunPlate = async (index: number) => {
        const plate = SAMPLE_PLATES[index];
        if (!plate || submissionInFlight) {
            return;
        }
        setActiveEntryFileName(plate.entryFileName);
        try {
            const archiveFile = await buildSampleArchive(plate);
            await properties.applicationController.handleArchiveSubmission(
                archiveFile,
                plate.entryFileName,
            );
        } finally {
            setActiveEntryFileName("");
        }
    };
    return (
        <section className="language-gallery" aria-labelledby="language-index-heading">
            <p className="section-eyebrow">PLATE ONE</p>
            <h2 className="section-heading" id="language-index-heading">
                The Language Index
            </h2>
            <p className="section-support">
                Select a plate to compile and run a showcase program in your browser.
            </p>
            <div className="language-grid">
                {SAMPLE_PLATES.map((plate, index) => {
                    const plateNumber = String(index + 1).padStart(2, "0");
                    const isActive = activeEntryFileName === plate.entryFileName;
                    return (
                        <article className="language-plate" key={plate.entryFileName}>
                            <span className="plate-number" aria-hidden="true">
                                {plateNumber}
                            </span>
                            <h3 className="plate-language">{plate.languageLabel}</h3>
                            <p className="plate-file">{plate.entryFileName}</p>
                            <p className="plate-title">{plate.programTitle}</p>
                            <p className="plate-description">{plate.description}</p>
                            <button
                                className="plate-run-button"
                                type="button"
                                disabled={submissionInFlight}
                                aria-label={`Run the ${plate.languageLabel} plate`}
                                onClick={() => void handleRunPlate(index)}
                            >
                                {isActive ? "Building" : "Run plate"}
                            </button>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
export { LanguageGalleryView };
