import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { SqliteWasmPerformer } from "@clientTheatre/runtimePerformers/SqliteWasmPerformer.ts";
import { SqliteWasmRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/SqliteWasmRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class FakeTerminalStage {
    readonly writtenText: Array<string> = [];
    readonly writtenLines: Array<string> = [];
    writeText(text: string): void {
        this.writtenText.push(text);
    }
    writeLine(text: string): void {
        this.writtenLines.push(text);
    }
    async readLine(_promptText: string): Promise<string> {
        return "";
    }
    get shownText(): string {
        return this.writtenText.join("");
    }
}
interface SqliteFixture {
    performer: SqliteWasmPerformer;
    stage: FakeTerminalStage;
    dispose(): Promise<void>;
}
async function createFixture(entrySourceText: string): Promise<SqliteFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-sqlite-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    const assembler = new SqliteWasmRuntimeAssembler(new FileSystemOperations());
    await assembler.assembleRuntimeInto({
        sessionIdentifier: "test-session",
        sessionDirectory: fixtureDirectory,
        sourceDirectory: join(fixtureDirectory, "source"),
        runtimeDirectory,
        userCodeDirectory: join(fixtureDirectory, "user-code"),
        entryFileRelativePath: "main.sql",
        programArguments: [],
        languageIdentifier: "sql",
    });
    const stage = new FakeTerminalStage();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.sql",
                    includedFileRelativePaths: ["main.sql"],
                    programArguments: [],
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.sql")) {
            return { ok: true, text: async () => entrySourceText } as Response;
        }
        if (url.startsWith("file:")) {
            const assetBytes = await readFile(new URL(url));
            return new Response(assetBytes, { status: 200 });
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new SqliteWasmPerformer(pathToFileURL(fixtureDirectory).href);
    await performer.loadInto(stage as unknown as TerminalStageController);
    return {
        performer,
        stage,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
describe("SqliteWasmPerformer", () => {
    test("executes every statement and prints each result row", async () => {
        const fixture = await createFixture(
            "CREATE TABLE probe (label TEXT NOT NULL, amount INTEGER NOT NULL);\n" +
                "INSERT INTO probe (label, amount) VALUES ('alpha', 7), ('beta', 12);\n" +
                "SELECT label || ':' || amount AS reading FROM probe ORDER BY label ASC;\n" +
                "SELECT NULL AS empty, 'PROBE-DONE' AS marker;\n",
        );
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("alpha:7\nbeta:12\nNULL | PROBE-DONE\n");
        } finally {
            await fixture.dispose();
        }
    });
    test("surfaces a readable error for broken SQL", async () => {
        const fixture = await createFixture("SELEKT broken;");
        try {
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow(/syntax error/);
        } finally {
            await fixture.dispose();
        }
    });
});
