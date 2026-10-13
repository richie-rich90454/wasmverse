import { afterEach, describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { TeaVmCompilerStrategy } from "@serverAtelier/compilerStrategies/TeaVmCompilerStrategy.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import type { ProcessOutcome, ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
interface RecordedCall {
    command: ReadonlyArray<string>;
    workingDirectory: string | undefined;
}
class RecordingProcessRunner {
    readonly calls: Array<RecordedCall> = [];
    constructor(
        private readonly outcome: ProcessOutcome = {
            exitCode: 0,
            standardOutput: "",
            standardError: "",
        },
    ) {}
    async runToCompletion(
        command: ReadonlyArray<string>,
        options: { workingDirectory?: string } = {},
    ): Promise<ProcessOutcome> {
        this.calls.push({ command, workingDirectory: options.workingDirectory });
        return this.outcome;
    }
}
const temporaryDirectories: Array<string> = [];
interface SessionLayout {
    sourceDirectory: string;
    runtimeDirectory: string;
    strategy: TeaVmCompilerStrategy;
    processRunner: RecordingProcessRunner;
}
async function createSessionLayout(): Promise<SessionLayout> {
    const sessionRoot = await mkdtemp(join(tmpdir(), "wasmverse-teavm-strategy-"));
    temporaryDirectories.push(sessionRoot);
    const sourceDirectory = join(sessionRoot, "source");
    const runtimeDirectory = join(sessionRoot, "runtime");
    await mkdir(join(sourceDirectory, "target", "wasmverse"), { recursive: true });
    await writeFile(
        join(sourceDirectory, "target", "wasmverse", "classes.js"),
        "export function main() {}\n",
    );
    const teaVmDirectory = join(sessionRoot, "teavm");
    const mavenBinaryPath = join(sessionRoot, "mvn");
    await mkdir(teaVmDirectory, { recursive: true });
    await writeFile(mavenBinaryPath, "");
    const processRunner = new RecordingProcessRunner();
    const strategy = new TeaVmCompilerStrategy(
        processRunner as unknown as ProcessRunner,
        new FileSystemOperations(),
        teaVmDirectory,
        "linux",
        mavenBinaryPath,
    );
    return { sourceDirectory, runtimeDirectory, strategy, processRunner };
}
function buildContext(sourceDirectory: string, runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory,
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "Main.java",
        programArguments: [],
        languageIdentifier: "java",
    };
}
afterEach(async () => {
    while (temporaryDirectories.length > 0) {
        await rm(temporaryDirectories.pop() as string, { recursive: true, force: true });
    }
});
describe("TeaVmCompilerStrategy", () => {
    test("copies every java file, derives the main class from the package, and wires the stdin transformer", async () => {
        const { sourceDirectory, runtimeDirectory, strategy, processRunner } =
            await createSessionLayout();
        await writeFile(
            join(sourceDirectory, "Main.java"),
            "package demo;\n\npublic class Main {\n    public static void main(String[] args) {\n    }\n}\n",
        );
        await mkdir(join(sourceDirectory, "util"), { recursive: true });
        await writeFile(
            join(sourceDirectory, "util", "Helper.java"),
            "package demo.util;\n\npublic class Helper {\n}\n",
        );
        await strategy.compileSourceInto(buildContext(sourceDirectory, runtimeDirectory));
        const projectText = await readFile(join(sourceDirectory, "pom.xml"), "utf8");
        expect(projectText).toContain("<mainClass>demo.Main</mainClass>");
        expect(projectText).toContain(
            "<transformer>wasmverse.support.WasmVerseInputTransformer</transformer>",
        );
        expect(existsSync(join(sourceDirectory, "src", "main", "java", "Main.java"))).toBe(true);
        expect(
            existsSync(join(sourceDirectory, "src", "main", "java", "util", "Helper.java")),
        ).toBe(true);
        const inputText = await readFile(
            join(
                sourceDirectory,
                "src",
                "main",
                "java",
                "wasmverse",
                "support",
                "WasmVerseInput.java",
            ),
            "utf8",
        );
        expect(inputText).toContain("@JSBody");
        expect(inputText).toContain("$wasmverseReadByte");
        const transformerText = await readFile(
            join(
                sourceDirectory,
                "src",
                "main",
                "java",
                "wasmverse",
                "support",
                "WasmVerseInputTransformer.java",
            ),
            "utf8",
        );
        expect(transformerText).toContain("implements ClassHolderTransformer");
        expect(transformerText).toContain('"java.lang.System"');
        expect(await readFile(join(runtimeDirectory, "classes.js"), "utf8")).toContain("main");
        const packageCall = processRunner.calls.find((call) => call.command.includes("package"));
        expect(packageCall).toBeDefined();
        expect(packageCall?.workingDirectory).toBe(sourceDirectory);
    });
    test("keeps the flattened single file layout and the basename main class", async () => {
        const { sourceDirectory, runtimeDirectory, strategy } = await createSessionLayout();
        await writeFile(
            join(sourceDirectory, "Main.java"),
            "public class Main {\n    public static void main(String[] args) {\n    }\n}\n",
        );
        await strategy.compileSourceInto(buildContext(sourceDirectory, runtimeDirectory));
        const projectText = await readFile(join(sourceDirectory, "pom.xml"), "utf8");
        expect(projectText).toContain("<mainClass>Main</mainClass>");
        expect(existsSync(join(sourceDirectory, "src", "main", "java", "Main.java"))).toBe(true);
    });
    test("keeps a user supplied project file and its layout untouched", async () => {
        const { sourceDirectory, runtimeDirectory, strategy } = await createSessionLayout();
        await writeFile(join(sourceDirectory, "pom.xml"), "<project></project>\n");
        await writeFile(join(sourceDirectory, "Main.java"), "public class Main {}\n");
        await strategy.compileSourceInto(buildContext(sourceDirectory, runtimeDirectory));
        expect(await readFile(join(sourceDirectory, "pom.xml"), "utf8")).toBe(
            "<project></project>\n",
        );
        expect(existsSync(join(sourceDirectory, "src"))).toBe(false);
        expect(existsSync(join(runtimeDirectory, "classes.js"))).toBe(true);
    });
});
