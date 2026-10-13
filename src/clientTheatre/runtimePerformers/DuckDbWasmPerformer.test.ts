import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitDuckDbStatements } from "@clientTheatre/runtimePerformers/DuckDbWasmPerformer.ts";
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
    test("copies the browser module, worker, wasm, and the arrow module graph", async () => {
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
            expect(browserModuleText).toContain("./apache-arrow/Arrow.dom.js");
            expect(browserModuleText).not.toContain('from"apache-arrow"');
            expect(browserModuleText).not.toContain("cdn.jsdelivr.net");
            const workerText = await readFile(
                join(runtimeDirectory, "duckdb/duckdb-browser-eh.worker.js"),
                "utf8",
            );
            expect(workerText.startsWith("WebAssembly.instantiateStreaming")).toBe(true);
            const arrowEntryText = await readFile(
                join(runtimeDirectory, "duckdb/apache-arrow/Arrow.dom.js"),
                "utf8",
            );
            expect(arrowEntryText).not.toMatch(/\.mjs['"]/);
            const arrowAdaptersText = await readFile(
                join(runtimeDirectory, "duckdb/apache-arrow/io/adapters.js"),
                "utf8",
            );
            expect(arrowAdaptersText).toContain('"../../tslib.js"');
            const arrowMessageText = await readFile(
                join(runtimeDirectory, "duckdb/apache-arrow/ipc/message.js"),
                "utf8",
            );
            expect(arrowMessageText).toContain("'../../flatbuffers/flatbuffers.js'");
            await expect(
                readFile(join(runtimeDirectory, "duckdb/flatbuffers/flatbuffers.js")),
            ).resolves.toBeTruthy();
            await expect(readFile(join(runtimeDirectory, "duckdb/tslib.js"))).resolves.toBeTruthy();
            await expect(
                readFile(join(runtimeDirectory, "duckdb/duckdb-eh.wasm")),
            ).resolves.toBeTruthy();
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
