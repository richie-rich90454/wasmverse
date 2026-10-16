import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const PROLOG_RUNTIME_DIRECTORY_NAME = "prolog";
const PROLOG_RUNTIME_SCRIPT_FILE_NAMES: ReadonlyArray<string> = [
    "modules/core.js",
    "modules/lists.js",
];
const PROLOG_ENTRY_GOAL = "once(main).";
const CONSOLE_METHOD_NAMES: ReadonlyArray<string> = ["log", "error", "info", "warn", "debug"];
interface TauUserInputRecord {
    get(length: number, position: unknown): string;
    eof(position: unknown): boolean;
}
interface TauStreamRecord {
    stream: TauUserInputRecord;
    position: unknown;
}
interface TauFileRecord {
    text: string;
}
interface TauPrologInstance {
    create(limit?: number): TauSessionRecord;
    type: { is_error(candidate: unknown): boolean };
}
interface TauSessionRecord {
    consult(programs: string | ReadonlyArray<string>, options?: Record<string, unknown>): unknown;
    query(goal: string, options?: Record<string, unknown>): unknown;
    answer(callback: (answer: unknown) => void): unknown;
    format_answer(answer: unknown): string;
    file_system: { open(path: string, type: string, mode: string): TauFileRecord | null };
    streams: Record<string, TauStreamRecord>;
}
class TauPrologScriptLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl.replace(/\/+$/, ""));
    }
    async loadRuntimeScripts(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Prolog runtime.");
        for (const scriptFileName of PROLOG_RUNTIME_SCRIPT_FILE_NAMES) {
            await this.loadScript(
                this.assetLocator.resolveAssetUrl(
                    `runtime/${PROLOG_RUNTIME_DIRECTORY_NAME}/${scriptFileName}`,
                ),
            );
        }
    }
    private loadScript(scriptUrl: string): Promise<void> {
        return new Promise<void>((resolveScript, rejectScript) => {
            const scriptElement = document.createElement("script");
            scriptElement.src = scriptUrl;
            scriptElement.onload = () => resolveScript();
            scriptElement.onerror = () => rejectScript(new Error(`Failed to load ${scriptUrl}.`));
            document.head.appendChild(scriptElement);
        });
    }
}
class TauPrologPerformer implements TerminalPerformerContract {
    private readonly scriptLoader: TauPrologScriptLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private prologInstance: TauPrologInstance | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    private savedConsoleMethods: Array<[string, (...values: Array<unknown>) => void]> = [];
    constructor(sessionBaseUrl: string) {
        this.scriptLoader = new TauPrologScriptLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.scriptLoader.loadRuntimeScripts(stage);
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        this.prologInstance = globalRecord["pl"] as TauPrologInstance | undefined;
        if (!this.prologInstance) {
            throw new Error("tau-prolog runtime did not install itself on the page.");
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Prolog runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running Prolog program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            this.routeConsoleIntoOutput();
            let inputWasNeeded = false;
            try {
                await this.runProgramAttempt(fedLines);
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describePrologError(runError));
                }
                inputWasNeeded = true;
            } finally {
                this.restoreConsole();
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private async runProgramAttempt(fedLines: ReadonlyArray<string>): Promise<void> {
        const prologInstance = this.prologInstance as TauPrologInstance;
        const session = prologInstance.create();
        this.installReplayStdin(session, fedLines);
        this.preloadUserFilesIntoVirtualFileSystem(session);
        const programTexts = this.collectProgramTexts();
        for (const programText of programTexts) {
            await new Promise<void>((resolveConsult, rejectConsult) => {
                session.consult(programText, {
                    success: () => resolveConsult(),
                    error: (errorTerm: unknown) =>
                        rejectConsult(new Error(this.formatPrologError(session, errorTerm))),
                });
            });
        }
        await new Promise<void>((resolveQuery, rejectQuery) => {
            session.query(PROLOG_ENTRY_GOAL, {
                success: () => resolveQuery(),
                error: (errorTerm: unknown) =>
                    rejectQuery(new Error(this.formatPrologError(session, errorTerm))),
            });
        });
        await new Promise<void>((resolveAnswers, rejectAnswers) => {
            const step = (answer: unknown): void => {
                if (answer === false) {
                    resolveAnswers();
                    return;
                }
                if (prologInstance.type.is_error(answer)) {
                    const formattedAnswer = session.format_answer(answer);
                    if (isTerminalInputNeeded(formattedAnswer)) {
                        throw new TerminalInputNeededSignal();
                    }
                    rejectAnswers(new Error(formattedAnswer));
                    return;
                }
                session.answer(step);
            };
            session.answer(step);
        });
    }
    private formatPrologError(session: TauSessionRecord, errorTerm: unknown): string {
        const formattedAnswer = session.format_answer(errorTerm);
        if (formattedAnswer !== "true" && formattedAnswer !== "false") {
            return formattedAnswer;
        }
        return String(errorTerm);
    }
    private installReplayStdin(session: TauSessionRecord, fedLines: ReadonlyArray<string>): void {
        let fedIndex = 0;
        let pendingText = "";
        const replayStdin: TauUserInputRecord = {
            get: (length: number) => {
                while (pendingText.length < length) {
                    if (fedIndex < fedLines.length) {
                        pendingText += `${fedLines[fedIndex]}\n`;
                        fedIndex += 1;
                        continue;
                    }
                    throw new TerminalInputNeededSignal();
                }
                const requestedText = pendingText.slice(0, length);
                pendingText = pendingText.slice(length);
                return requestedText;
            },
            eof: () => false,
        };
        const userInputStream = session.streams["user_input"] as TauStreamRecord;
        userInputStream.stream = replayStdin;
    }
    private preloadUserFilesIntoVirtualFileSystem(session: TauSessionRecord): void {
        for (const [relativePath, fileContent] of this.userFiles) {
            const preloadedFile = session.file_system.open(`/${relativePath}`, "text", "write");
            if (preloadedFile) {
                preloadedFile.text = fileContent;
            }
        }
    }
    private collectProgramTexts(): Array<string> {
        const helperRelativePaths = [...this.userFiles.keys()]
            .filter((relativePath) => relativePath !== this.entryRelativePath)
            .sort();
        const programTexts = [this.buildArgumentsProgramText()];
        for (const relativePath of helperRelativePaths) {
            if (relativePath === "manifest.json" || relativePath.endsWith(".pl")) {
                programTexts.push(this.userFiles.get(relativePath) as string);
            }
        }
        programTexts.push(this.userFiles.get(this.entryRelativePath) as string);
        return programTexts;
    }
    private buildArgumentsProgramText(): string {
        const argumentFacts = this.programArguments
            .map(
                (argument, index) =>
                    `wasmverse_argument(${index}, ${this.escapePrologAtom(argument)}).`,
            )
            .join("\n");
        return `${argumentFacts}\nwasmverse_argument_count(${this.programArguments.length}).`;
    }
    private escapePrologAtom(value: string): string {
        return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
    }
    private routeConsoleIntoOutput(): void {
        const consoleRecord = console as unknown as Record<
            string,
            (...values: Array<unknown>) => void
        >;
        for (const methodName of CONSOLE_METHOD_NAMES) {
            const originalMethod = consoleRecord[methodName] as (...values: Array<unknown>) => void;
            this.savedConsoleMethods.push([methodName, originalMethod]);
            consoleRecord[methodName] = (...values: Array<unknown>) => {
                this.outputTracker.appendText(values.map((value) => String(value)).join(" "));
            };
        }
    }
    private restoreConsole(): void {
        const consoleRecord = console as unknown as Record<
            string,
            (...values: Array<unknown>) => void
        >;
        for (const [methodName, originalMethod] of this.savedConsoleMethods) {
            consoleRecord[methodName] = originalMethod;
        }
        this.savedConsoleMethods = [];
    }
    private describePrologError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { TauPrologPerformer };
