import { describe, expect, test } from "vitest";
import {
    FEATURE_NAMES,
    LANGUAGE_DISPLAY_LABELS,
    MATRIX_LANGUAGE_ROWS,
    displayLabelForLanguage,
    featureStatusLabel,
    matrixSummaryText,
    sortedRows,
    summarizeMatrix,
} from "@clientTheatre/services/CompatibilityMatrixCatalog.ts";
import type { MatrixLanguageRow } from "@clientTheatre/services/CompatibilityMatrixCatalog.ts";
function makeRow(
    languageIdentifier: string,
    overrides: Partial<Omit<MatrixLanguageRow, "languageIdentifier">> = {},
): MatrixLanguageRow {
    return {
        languageIdentifier,
        toolchain: "pending",
        showcase: "pending",
        features: {},
        exportBytes: 0,
        problems: [],
        ...overrides,
    };
}
describe("featureStatusLabel", () => {
    test("maps statuses to plain text markers", () => {
        expect(featureStatusLabel("pass")).toBe("yes");
        expect(featureStatusLabel("fail")).toBe("no");
        expect(featureStatusLabel("unsupported")).toBe("n/a");
        expect(featureStatusLabel("pending")).toBe("—");
    });
    test("treats absent feature entries as unmeasured", () => {
        expect(featureStatusLabel(undefined)).toBe("—");
    });
});
describe("summarizeMatrix", () => {
    test("counts verification states and unsupported feature cells", () => {
        const rows = [
            makeRow("rust", {
                toolchain: "ready",
                showcase: "pass",
                features: {
                    stdin: "pass",
                    arguments: "pass",
                    fileIo: "fail",
                    multiFile: "unsupported",
                },
            }),
            makeRow("go", {
                toolchain: "ready",
                showcase: "fail",
                features: { stdin: "fail" },
            }),
            makeRow("python"),
        ];
        expect(summarizeMatrix(rows)).toEqual({
            total: 3,
            verified: 1,
            ready: 2,
            failing: 1,
            pending: 1,
            unsupported: 1,
        });
    });
    test("counts an empty matrix as all zero", () => {
        expect(summarizeMatrix([])).toEqual({
            total: 0,
            verified: 0,
            ready: 0,
            failing: 0,
            pending: 0,
            unsupported: 0,
        });
    });
});
describe("sortedRows", () => {
    test("places ready rows first and sorts each group by display label", () => {
        const rows = [
            makeRow("python"),
            makeRow("rust", { toolchain: "ready" }),
            makeRow("ruby"),
            makeRow("c", { toolchain: "ready" }),
            makeRow("go", { toolchain: "ready" }),
        ];
        const ordered = sortedRows(rows).map((row) => row.languageIdentifier);
        expect(ordered).toEqual(["c", "go", "rust", "python", "ruby"]);
    });
    test("does not mutate the input order", () => {
        const rows = [makeRow("python"), makeRow("c", { toolchain: "ready" })];
        sortedRows(rows);
        expect(rows.map((row) => row.languageIdentifier)).toEqual(["python", "c"]);
    });
});
describe("displayLabelForLanguage", () => {
    test("maps catalog languages to their display labels", () => {
        expect(Object.keys(LANGUAGE_DISPLAY_LABELS)).toHaveLength(17);
        expect(displayLabelForLanguage("cpp")).toBe("C++");
        expect(displayLabelForLanguage("csharp")).toBe("C#");
        expect(displayLabelForLanguage("assemblyscript")).toBe("AssemblyScript");
    });
    test("falls back to the raw identifier for unknown languages", () => {
        expect(displayLabelForLanguage("brainfuck")).toBe("brainfuck");
    });
});
describe("matrixSummaryText", () => {
    test("renders the headline counts", () => {
        const summary = {
            total: 17,
            verified: 12,
            ready: 13,
            failing: 1,
            pending: 4,
            unsupported: 2,
        };
        expect(matrixSummaryText(summary)).toBe(
            "12 of 17 verified · 4 toolchain pending · 1 failing",
        );
    });
    test("omits zero pending and failing segments", () => {
        const summary = {
            total: 17,
            verified: 17,
            ready: 17,
            failing: 0,
            pending: 0,
            unsupported: 0,
        };
        expect(matrixSummaryText(summary)).toBe("17 of 17 verified");
    });
});
describe("MATRIX_LANGUAGE_ROWS", () => {
    test("exposes unique generated languages with display labels", () => {
        expect(MATRIX_LANGUAGE_ROWS.length).toBeGreaterThan(0);
        const identifiers = MATRIX_LANGUAGE_ROWS.map((row) => row.languageIdentifier);
        expect(new Set(identifiers).size).toBe(identifiers.length);
        for (const identifier of identifiers) {
            expect(identifier in LANGUAGE_DISPLAY_LABELS).toBe(true);
        }
    });
    test("keeps every row within the documented status unions", () => {
        for (const row of MATRIX_LANGUAGE_ROWS) {
            expect(["ready", "pending"]).toContain(row.toolchain);
            expect(["pass", "fail", "pending"]).toContain(row.showcase);
            for (const status of Object.values(row.features)) {
                expect(["pass", "fail", "unsupported", "pending"]).toContain(status);
            }
        }
    });
    test("orders columns stdin, arguments, file io, multi-file", () => {
        expect(FEATURE_NAMES).toEqual(["stdin", "arguments", "fileIo", "multiFile"]);
    });
});
