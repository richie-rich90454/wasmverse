import compatibilityMatrixDocument from "../../../compatibility-matrix.json";
type FeatureName = "stdin" | "arguments" | "fileIo" | "multiFile";
type FeatureStatus = "pass" | "fail" | "unsupported" | "pending";
type ToolchainStatus = "ready" | "pending";
type ShowcaseStatus = "pass" | "fail" | "pending";
type MatrixLanguageRow = {
    languageIdentifier: string;
    toolchain: ToolchainStatus;
    showcase: ShowcaseStatus;
    features: Partial<Record<FeatureName, FeatureStatus>>;
    exportBytes: number;
    problems: ReadonlyArray<string>;
};
type CompatibilityMatrixDocument = {
    generatedAt: string;
    source: string;
    languages: ReadonlyArray<MatrixLanguageRow>;
};
type MatrixSummary = {
    total: number;
    verified: number;
    ready: number;
    failing: number;
    pending: number;
    unsupported: number;
};
const compatibilityMatrix = compatibilityMatrixDocument as unknown as CompatibilityMatrixDocument;
const MATRIX_LANGUAGE_ROWS: ReadonlyArray<MatrixLanguageRow> = compatibilityMatrix.languages;
const MATRIX_GENERATED_AT: string = compatibilityMatrix.generatedAt;
const FEATURE_NAMES: ReadonlyArray<FeatureName> = ["stdin", "arguments", "fileIo", "multiFile"];
const FEATURE_COLUMN_LABELS: Readonly<Record<FeatureName, string>> = {
    stdin: "stdin",
    arguments: "arguments",
    fileIo: "file io",
    multiFile: "multi-file",
};
const LANGUAGE_DISPLAY_LABELS: Readonly<Record<string, string>> = {
    python: "Python",
    ruby: "Ruby",
    lua: "Lua",
    php: "PHP",
    rust: "Rust",
    c: "C",
    cpp: "C++",
    go: "Go",
    zig: "Zig",
    swift: "Swift",
    kotlin: "Kotlin",
    dart: "Dart",
    java: "Java",
    csharp: "C#",
    assemblyscript: "AssemblyScript",
    ocaml: "OCaml",
    haskell: "Haskell",
    javascript: "JavaScript",
    typescript: "TypeScript",
    sql: "SQL",
};
function displayLabelForLanguage(languageIdentifier: string): string {
    return LANGUAGE_DISPLAY_LABELS[languageIdentifier] ?? languageIdentifier;
}
function featureStatusLabel(status: FeatureStatus | undefined): string {
    switch (status) {
        case "pass":
            return "yes";
        case "fail":
            return "no";
        case "unsupported":
            return "n/a";
        default:
            return "—";
    }
}
function summarizeMatrix(rows: ReadonlyArray<MatrixLanguageRow>): MatrixSummary {
    const summary: MatrixSummary = {
        total: rows.length,
        verified: 0,
        ready: 0,
        failing: 0,
        pending: 0,
        unsupported: 0,
    };
    for (const row of rows) {
        if (row.toolchain === "ready") {
            summary.ready += 1;
        }
        if (row.toolchain === "pending") {
            summary.pending += 1;
        }
        if (row.showcase === "pass") {
            summary.verified += 1;
        }
        if (row.showcase === "fail") {
            summary.failing += 1;
        }
        for (const status of Object.values(row.features)) {
            if (status === "unsupported") {
                summary.unsupported += 1;
            }
        }
    }
    return summary;
}
function matrixSummaryText(summary: MatrixSummary): string {
    const segments = [`${summary.verified} of ${summary.total} verified`];
    if (summary.pending > 0) {
        segments.push(`${summary.pending} toolchain pending`);
    }
    if (summary.failing > 0) {
        segments.push(`${summary.failing} failing`);
    }
    return segments.join(" · ");
}
function sortedRows(rows: ReadonlyArray<MatrixLanguageRow>): ReadonlyArray<MatrixLanguageRow> {
    return [...rows].sort((left, right) => {
        const leftRank = left.toolchain === "ready" ? 0 : 1;
        const rightRank = right.toolchain === "ready" ? 0 : 1;
        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }
        const leftLabel = displayLabelForLanguage(left.languageIdentifier);
        const rightLabel = displayLabelForLanguage(right.languageIdentifier);
        if (leftLabel === rightLabel) {
            return 0;
        }
        return leftLabel < rightLabel ? -1 : 1;
    });
}
export {
    FEATURE_COLUMN_LABELS,
    FEATURE_NAMES,
    LANGUAGE_DISPLAY_LABELS,
    MATRIX_GENERATED_AT,
    MATRIX_LANGUAGE_ROWS,
    displayLabelForLanguage,
    featureStatusLabel,
    matrixSummaryText,
    sortedRows,
    summarizeMatrix,
};
export type {
    FeatureName,
    FeatureStatus,
    MatrixLanguageRow,
    MatrixSummary,
    ShowcaseStatus,
    ToolchainStatus,
};
