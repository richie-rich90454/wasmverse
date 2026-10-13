import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { JqWasmPerformer } from "@clientTheatre/runtimePerformers/JqWasmPerformer.ts";
import { JqWasmRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/JqWasmRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const toolchainAvailable = existsSync(join(process.cwd(), ".tools/jq-wasm/jq.wasm"));
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
interface JqFixture {
    performer: JqWasmPerformer;
    stage: FakeTerminalStage;
    dispose(): Promise<void>;
}
async function createFixture(
    userFileTexts: Record<string, string>,
    entryFileName: string,
    programArguments: ReadonlyArray<string>,
): Promise<JqFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-jq-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    const assembler = new JqWasmRuntimeAssembler(new FileSystemOperations());
    await assembler.assembleRuntimeInto({
        sessionIdentifier: "test-session",
        sessionDirectory: fixtureDirectory,
        sourceDirectory: join(fixtureDirectory, "source"),
        runtimeDirectory,
        userCodeDirectory: join(fixtureDirectory, "user-code"),
        entryFileRelativePath: entryFileName,
        programArguments,
        languageIdentifier: "jq",
    });
    const stage = new FakeTerminalStage();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: entryFileName,
                    includedFileRelativePaths: Object.keys(userFileTexts),
                    programArguments,
                }),
            } as Response;
        }
        const userFileMatch = Object.keys(userFileTexts).find((relativePath) =>
            url.endsWith(`/user-code/${relativePath}`),
        );
        if (userFileMatch) {
            return {
                ok: true,
                text: async () => userFileTexts[userFileMatch] as string,
            } as Response;
        }
        if (url.startsWith("file:")) {
            const assetBytes = await readFile(new URL(url));
            return new Response(assetBytes, { status: 200 });
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new JqWasmPerformer(pathToFileURL(fixtureDirectory).href);
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
describe.skipIf(!toolchainAvailable)("JqWasmPerformer", () => {
    test("runs the probe filter over its input document with mapped arguments", async () => {
        const fixture = await createFixture(
            {
                "main.jq": '"greet:" + .name, ("arg0:" + $arg0), "PROBE-DONE"\n',
                "data.json": '{"name": "probe-data"}\n',
            },
            "main.jq",
            ["alpha"],
        );
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("greet:probe-data\narg0:alpha\nPROBE-DONE\n");
        } finally {
            await fixture.dispose();
        }
    });
    test("runs the shipped showcase to completion", async () => {
        const showcaseSource = await readFile("./userSourceTemplates/main.jq", "utf8");
        const fixture = await createFixture({ "main.jq": showcaseSource }, "main.jq", []);
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toContain("prime count: 46");
            expect(fixture.stage.shownText).toContain("largest prime: 199");
            expect(fixture.stage.shownText).toContain("supplies: total 60");
            expect(fixture.stage.shownText).toContain("Showcase complete.");
        } finally {
            await fixture.dispose();
        }
    });
});
