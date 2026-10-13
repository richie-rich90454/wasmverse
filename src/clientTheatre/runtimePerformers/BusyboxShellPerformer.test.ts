import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { BusyboxShellPerformer } from "@clientTheatre/runtimePerformers/BusyboxShellPerformer.ts";
import { BusyboxWasiRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/BusyboxWasiRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const toolchainAvailable = existsSync(join(process.cwd(), ".tools/wasi-sh/dist/busybox.wasm"));
class FakeTerminalStage {
    readonly writtenText: Array<string> = [];
    readonly writtenLines: Array<string> = [];
    readonly fedLines: Array<string>;
    private fedIndex: number = 0;
    constructor(fedLines: Array<string>) {
        this.fedLines = fedLines;
    }
    writeText(text: string): void {
        this.writtenText.push(text);
    }
    writeLine(text: string): void {
        this.writtenLines.push(text);
    }
    async readLine(_promptText: string): Promise<string> {
        const nextLine = this.fedLines[this.fedIndex] ?? "";
        this.fedIndex++;
        return nextLine;
    }
    get shownText(): string {
        return this.writtenText.join("");
    }
}
interface BashFixture {
    performer: BusyboxShellPerformer;
    stage: FakeTerminalStage;
    dispose(): Promise<void>;
}
async function createFixture(
    userFileTexts: Record<string, string>,
    entryFileName: string,
    programArguments: ReadonlyArray<string>,
    fedLines: Array<string>,
): Promise<BashFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-bash-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    const assembler = new BusyboxWasiRuntimeAssembler(new FileSystemOperations());
    await assembler.assembleRuntimeInto({
        sessionIdentifier: "test-session",
        sessionDirectory: fixtureDirectory,
        sourceDirectory: join(fixtureDirectory, "source"),
        runtimeDirectory,
        userCodeDirectory: join(fixtureDirectory, "user-code"),
        entryFileRelativePath: entryFileName,
        programArguments,
        languageIdentifier: "bash",
    });
    const stage = new FakeTerminalStage(fedLines);
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
    const performer = new BusyboxShellPerformer(pathToFileURL(fixtureDirectory).href);
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
const PROBE_PROGRAM =
    "read name\n" +
    ". /helper.sh\n" +
    'echo "greet:$(helper_label):$name"\n' +
    'echo "arg0:$1"\n' +
    "echo written > out.txt\n" +
    'echo "file:$(cat out.txt)"\n' +
    "echo PROBE-DONE\n";
describe.skipIf(!toolchainAvailable)("BusyboxShellPerformer", () => {
    test("replays stdin and supports arguments, files, and sourcing", async () => {
        const fixture = await createFixture(
            {
                "main.sh": PROBE_PROGRAM,
                "helper.sh": "helper_label() {\n    printf helper\n}\n",
            },
            "main.sh",
            ["alpha"],
            ["Ada"],
        );
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe(
                "greet:helper:Ada\narg0:alpha\nfile:written\nPROBE-DONE\n",
            );
        } finally {
            await fixture.dispose();
        }
    });
    test("runs the shipped showcase to completion", async () => {
        const showcaseSource = await readFile("./userSourceTemplates/main.sh", "utf8");
        const fixture = await createFixture({ "main.sh": showcaseSource }, "main.sh", [], []);
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toContain("prime count up to 120: 30");
            expect(fixture.stage.shownText).toContain("sum of 1..12 via awk: 78");
            expect(fixture.stage.shownText).toContain("Showcase complete.");
        } finally {
            await fixture.dispose();
        }
    });
});
