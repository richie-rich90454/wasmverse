import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const APL_RUNTIME_DIRECTORY_NAME = "ngn-apl";
const APL_RUNTIME_FILE_NAME = "apl.js";
const APL_SOURCE_EXTENSIONS: ReadonlyArray<string> = [".apl", ".dyalog"];
interface NgnAplWorkspaceOptions {
    in?: () => string;
    out?: (text: string) => void;
}
type NgnAplWorkspace = (sourceText: string) => unknown;
interface NgnAplNamespace {
    ws(options?: NgnAplWorkspaceOptions): NgnAplWorkspace;
}
interface NgnAplRuntimeModule {
    default: NgnAplNamespace;
}
class NgnAplRuntimeLoader {
    private readonly sessionBaseUrl: string;
    private runtimeNamespace: NgnAplNamespace | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl.replace(/\/+$/, "");
    }
    async loadRuntimeModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading APL runtime.");
        const runtimeModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/${APL_RUNTIME_DIRECTORY_NAME}/${APL_RUNTIME_FILE_NAME}`
        )) as NgnAplRuntimeModule;
        this.runtimeNamespace = runtimeModule.default;
    }
    get namespace(): NgnAplNamespace {
        if (!this.runtimeNamespace) {
            throw new Error("APL runtime not loaded. Call loadRuntimeModule first.");
        }
        return this.runtimeNamespace;
    }
}
class NgnAplStdinLines {
    private readonly fedLines: ReadonlyArray<string>;
    private lineIndex: number = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    nextLine(): string {
        if (this.lineIndex >= this.fedLines.length) {
            throw new TerminalInputNeededSignal();
        }
        const fedLine = this.fedLines[this.lineIndex] as string;
        this.lineIndex += 1;
        return fedLine;
    }
}
class NgnAplPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: NgnAplRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new NgnAplRuntimeLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        try {
            await this.runtimeLoader.loadRuntimeModule(stage);
        } catch (loadError) {
            const loadMessage = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`APL runtime failed to load: ${loadMessage}`);
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        if (!this.userFiles.has(this.entryRelativePath)) {
            throw new Error(`Entry program ${this.entryRelativePath} is missing from the session.`);
        }
        stage.writeLine("APL runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running APL program.");
        for (let inputCount = 0; ; inputCount += 1) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                const stdinLines = new NgnAplStdinLines(fedLines);
                const workspace = this.runtimeLoader.namespace.ws({
                    in: () => stdinLines.nextLine(),
                    out: (text: string) => this.outputTracker.appendText(text),
                });
                this.evaluateProgram(workspace);
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeAplError(runError));
                }
                inputWasNeeded = true;
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private evaluateProgram(workspace: NgnAplWorkspace): void {
        workspace(`wasmverseArguments\u2190${this.buildArgumentsLiteral()}`);
        for (const helperRelativePath of this.helperRelativePaths()) {
            workspace(this.normalizedSourceOf(helperRelativePath));
        }
        workspace(this.normalizedSourceOf(this.entryRelativePath));
    }
    private buildArgumentsLiteral(): string {
        if (this.programArguments.length === 0) {
            return "\u236c";
        }
        return this.programArguments
            .map((argument) => `(\u2282'${argument.replace(/'/g, "''")}')`)
            .join(",");
    }
    private helperRelativePaths(): ReadonlyArray<string> {
        return [...this.userFiles.keys()]
            .filter((relativePath) => {
                if (relativePath === this.entryRelativePath) {
                    return false;
                }
                const lowercasedPath = relativePath.toLowerCase();
                return APL_SOURCE_EXTENSIONS.some((extension) =>
                    lowercasedPath.endsWith(extension),
                );
            })
            .sort();
    }
    private normalizedSourceOf(relativePath: string): string {
        const sourceText = this.userFiles.get(relativePath);
        if (sourceText === undefined) {
            throw new Error(`Program file ${relativePath} is missing from the session.`);
        }
        return sourceText.replace(/\r\n?/g, "\n");
    }
    private describeAplError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? "";
        const errorName =
            runError instanceof Error && runError.name !== "Error" ? runError.name : "";
        const composedError =
            errorName.length > 0 && lastLine.length > 0
                ? `${errorName}: ${lastLine}`
                : errorName.length > 0
                  ? errorName
                  : lastLine.length > 0
                    ? lastLine
                    : "APL program failed without a message.";
        return composedError.length > 300 ? composedError.slice(0, 300) : composedError;
    }
}
export { NgnAplPerformer, NgnAplRuntimeLoader, NgnAplStdinLines };
export type { NgnAplNamespace, NgnAplWorkspace, NgnAplWorkspaceOptions };
