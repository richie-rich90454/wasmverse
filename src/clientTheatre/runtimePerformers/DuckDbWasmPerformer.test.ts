import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    DuckDbWasmPerformer,
    splitDuckDbStatements,
} from "@clientTheatre/runtimePerformers/DuckDbWasmPerformer.ts";
import { DuckDbWasmRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/DuckDbWasmRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
describe("splitDuckDbStatements", () => {
    test("splits plain statements and drops empty ones", () => {
        expect(splitDuckDbStatements("SELECT 1; SELECT 2;\n;")).toEqual(["SELECT 1", "SELECT 2"]);
    });
    test("keeps semicolons inside strings and comments", () => {
        const statements = splitDuckDbStatements(
            "INSERT INTO probe VALUES ('a;b');\n" +
                "-- trailing; comment\n" +
                "SELECT 1; /* block; comment */ SELECT 'it''s fine';",
        );
        expect(statements).toEqual([
            "INSERT INTO probe VALUES ('a;b')",
            "-- trailing; comment\nSELECT 1",
            "/* block; comment */ SELECT 'it''s fine'",
        ]);
    });
    test("keeps a comment-only script as a single terminator-free statement", () => {
        expect(splitDuckDbStatements("-- nothing to run;\n")).toEqual(["-- nothing to run;"]);
    });
});
const packageAvailable = existsSync(
    join(process.cwd(), "node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser.mjs"),
);
describe.skipIf(!packageAvailable)("DuckDbWasmRuntimeAssembler", () => {
    test("bundles the browser module and copies the worker and wasm", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-duckdb-"));
        try {
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new DuckDbWasmRuntimeAssembler(new FileSystemOperations());
            await assembler.assembleRuntimeInto({
                sessionIdentifier: "test-session",
                sessionDirectory: fixtureDirectory,
                sourceDirectory: join(fixtureDirectory, "source"),
                runtimeDirectory,
                userCodeDirectory: join(fixtureDirectory, "user-code"),
                entryFileRelativePath: "main.duckdb.sql",
                programArguments: [],
                languageIdentifier: "duckdb",
            });
            const browserModuleText = await readFile(
                join(runtimeDirectory, "duckdb/duckdb-runtime.js"),
                "utf8",
            );
            expect(browserModuleText).not.toContain('from"apache-arrow"');
            expect(browserModuleText).not.toContain("./apache-arrow/Arrow.dom.js");
            expect(browserModuleText).not.toContain("cdn.jsdelivr.net");
            expect(browserModuleText).toContain("AsyncDuckDB");
            const workerText = await readFile(
                join(runtimeDirectory, "duckdb/duckdb-browser-eh.worker.js"),
                "utf8",
            );
            expect(workerText.startsWith("WebAssembly.instantiateStreaming")).toBe(true);
            expect(workerText).toContain("arrayBuffer");
            await expect(
                readFile(join(runtimeDirectory, "duckdb/duckdb-eh.wasm")),
            ).resolves.toBeTruthy();
            expect(existsSync(join(runtimeDirectory, "duckdb/apache-arrow"))).toBe(false);
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
