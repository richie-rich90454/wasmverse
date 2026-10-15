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
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const SCHEME_RUNTIME_DIRECTORY_NAME = "scheme";
interface BiwaPortInstance {
    [portMarker: string]: unknown;
}
interface BiwaschemeNamespace {
    Interpreter: new (onError?: (error: unknown) => void) => BiwaInterpreterInstance;
    Port: {
        current_input: BiwaPortInstance;
        current_output: BiwaPortInstance;
        current_error: BiwaPortInstance;
        CustomInput: new (
            inputFunction: (feedCallback: (line: string) => void) => void,
        ) => BiwaPortInstance;
        CustomOutput: new (outputFunction: (text: string) => void) => BiwaPortInstance;
        StringInput: new (sourceText: string) => BiwaPortInstance;
    };
    define_libfunc(
        functionName: string,
        minimumArity: number,
        maximumArity: number,
        implementation: (
            argumentsList: Array<unknown>,
            interpreter: BiwaInterpreterInstance,
        ) => unknown,
    ): void;
    Pause: new (resumeFunction: unknown) => unknown;
    undef: unknown;
}
interface BiwaInterpreterInstance {
    evaluate(sourceText: string, afterEvaluate?: (value: unknown) => void): unknown;
    parser: { insert(sourceText: string): void };
}
class BiwaschemeRuntimeLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    private runtimeNamespace: BiwaschemeNamespace | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl.replace(/\/+$/, ""));
    }
    async loadRuntimeModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Scheme runtime.");
        const runtimeModule = (await import(
            /* @vite-ignore */ this.assetLocator.resolveAssetUrl(
                `runtime/${SCHEME_RUNTIME_DIRECTORY_NAME}/biwascheme.js`,
            )
        )) as { default: BiwaschemeNamespace };
        this.runtimeNamespace = runtimeModule.default;
    }
    get namespace(): BiwaschemeNamespace {
        if (!this.runtimeNamespace) {
            throw new Error("Scheme runtime not loaded. Call loadRuntimeModule first.");
        }
        return this.runtimeNamespace;
    }
}
class BiwaschemePerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: BiwaschemeRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new BiwaschemeRuntimeLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.runtimeLoader.loadRuntimeModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        const entrySourceText = this.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry script ${this.entryRelativePath} is missing from the session.`);
        }
        stage.writeLine("Scheme runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running Scheme program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                this.installSchemeHost(fedLines);
                const runtimeError = this.evaluateProgram();
                if (runtimeError !== undefined) {
                    if (!isTerminalInputNeeded(runtimeError)) {
                        throw new Error(this.describeSchemeError(runtimeError));
                    }
                    inputWasNeeded = true;
                }
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
    private installSchemeHost(fedLines: ReadonlyArray<string>): void {
        const namespace = this.runtimeLoader.namespace;
        let fedIndex = 0;
        namespace.Port.current_output = new namespace.Port.CustomOutput((text: string) => {
            this.outputTracker.appendText(text);
        });
        namespace.Port.current_error = namespace.Port.current_output;
        namespace.Port.current_input = new namespace.Port.CustomInput((feedCallback) => {
            if (fedIndex < fedLines.length) {
                const fedLine = fedLines[fedIndex] as string;
                fedIndex += 1;
                feedCallback(fedLine);
                return;
            }
            throw new TerminalInputNeededSignal();
        });
        namespace.define_libfunc("load", 1, 1, (argumentsList, interpreter) => {
            const requestedPath = String(argumentsList[0]);
            interpreter.parser.insert(this.readUserFile(requestedPath));
            return namespace.undef;
        });
        namespace.define_libfunc("open-input-file", 1, 1, (argumentsList) => {
            const requestedPath = String(argumentsList[0]);
            return new namespace.Port.StringInput(this.readUserFile(requestedPath));
        });
    }
    private evaluateProgram(): unknown {
        const namespace = this.runtimeLoader.namespace;
        let runtimeError: unknown = undefined;
        const interpreter = new namespace.Interpreter((error: unknown) => {
            runtimeError = error;
        });
        const argumentsDefinition = `(define wasmverse-arguments (list ${this.programArguments
            .map((argument) => this.escapeSchemeString(argument))
            .join(" ")}))`;
        interpreter.evaluate(argumentsDefinition);
        if (runtimeError !== undefined) {
            return runtimeError;
        }
        const entrySourceText = this.userFiles.get(this.entryRelativePath) as string;
        interpreter.evaluate(entrySourceText);
        return runtimeError;
    }
    private readUserFile(rawPath: string): string {
        const normalizedPath = normalizeWithinRoot(rawPath);
        const entryDirectory = directoryOf(this.entryRelativePath);
        const candidatePaths =
            entryDirectory.length > 0
                ? [joinRelativePath(entryDirectory, normalizedPath), normalizedPath]
                : [normalizedPath];
        for (const candidatePath of candidatePaths) {
            const fileContent = this.userFiles.get(candidatePath);
            if (fileContent !== undefined) {
                return fileContent;
            }
        }
        throw new Error(`File not found: ${rawPath}`);
    }
    private escapeSchemeString(value: string): string {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    private describeSchemeError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { BiwaschemePerformer };
