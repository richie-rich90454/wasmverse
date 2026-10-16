import {
    FEATURE_COLUMN_LABELS,
    FEATURE_NAMES,
    MATRIX_GENERATED_AT,
    MATRIX_LANGUAGE_ROWS,
    displayLabelForLanguage,
    featureStatusLabel,
    matrixSummaryText,
    sortedRows,
    summarizeMatrix,
} from "@clientTheatre/services/CompatibilityMatrixCatalog.ts";
import "@clientTheatre/styles/CompatibilityMatrix.css";
function CompatibilityMatrixView(): React.JSX.Element {
    const rows = sortedRows(MATRIX_LANGUAGE_ROWS);
    const summaryText = matrixSummaryText(summarizeMatrix(MATRIX_LANGUAGE_ROWS));
    return (
        <section className="compatibility-matrix" aria-labelledby="compatibility-matrix-heading">
            <p className="section-eyebrow">PLATE THREE</p>
            <h2 className="section-heading" id="compatibility-matrix-heading">
                The Compatibility Matrix
            </h2>
            <p className="section-support">
                Toolchain availability and runtime capabilities for every language plate in the
                index, measured by the export verifier.
            </p>
            <p className="matrix-summary">{summaryText}</p>
            <div className="matrix-table-scroll">
                <table className="matrix-table">
                    <thead>
                        <tr>
                            <th scope="col">Language</th>
                            <th scope="col">Toolchain</th>
                            <th scope="col">Showcase</th>
                            {FEATURE_NAMES.map((featureName) => (
                                <th scope="col" key={featureName}>
                                    {FEATURE_COLUMN_LABELS[featureName]}
                                </th>
                            ))}
                            <th scope="col">Export</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const languageLabel = displayLabelForLanguage(row.languageIdentifier);
                            return (
                                <tr key={row.languageIdentifier}>
                                    <th scope="row" className="matrix-language">
                                        {languageLabel}
                                    </th>
                                    <td
                                        className={`matrix-status matrix-status-${row.toolchain}`}
                                        title={`${languageLabel} toolchain: ${row.toolchain}`}
                                    >
                                        {row.toolchain}
                                    </td>
                                    <td
                                        className={`matrix-status matrix-status-${row.showcase}`}
                                        title={`${languageLabel} showcase: ${row.showcase}`}
                                    >
                                        {row.showcase}
                                    </td>
                                    {FEATURE_NAMES.map((featureName) => {
                                        const status = row.features[featureName];
                                        const marker = featureStatusLabel(status);
                                        const cellLabel = `${languageLabel} ${FEATURE_COLUMN_LABELS[featureName]}`;
                                        return (
                                            <td
                                                className={`matrix-feature matrix-feature-${status ?? "pending"}`}
                                                key={featureName}
                                                aria-label={`${cellLabel}: ${marker}`}
                                                title={`${cellLabel}: ${marker}`}
                                            >
                                                {marker}
                                            </td>
                                        );
                                    })}
                                    <td className="matrix-export">
                                        {row.toolchain === "ready"
                                            ? `${Math.round(row.exportBytes / 1024)} KB`
                                            : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="matrix-caption">
                Data from <code>pnpm verify:export</code>
                {MATRIX_GENERATED_AT === "seed" ? (
                    " · seed snapshot, run the verifier for live results"
                ) : (
                    <>
                        {" · generated "}
                        <time dateTime={MATRIX_GENERATED_AT}>{MATRIX_GENERATED_AT}</time>
                    </>
                )}
            </p>
        </section>
    );
}
export { CompatibilityMatrixView };
