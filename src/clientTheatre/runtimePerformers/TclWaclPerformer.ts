import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    directoryOf,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const TCL_RUNTIME_DIRECTORY_NAME = "tcl";
const WACL_SCRIPT_FILE_NAME = "wacl.js";
interface WaclFileSystem {
    FS_createPath(parentPath: string, path: string, canRead: boolean, canWrite: boolean): void;
    FS_createDataFile(
        parentPath: string,
        fileName: string,
        data: Uint8Array,
        canRead: boolean,
        canWrite: boolean,
    ): void;
}
interface WaclInterpreterApi {
    Eval(sourceText: string): string;
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    Module: WaclFileSystem;
}
interface WaclAmdModule {
    onReady(callback: (api: WaclInterpreterApi) => void): void;
}
interface WaclTclException {
    errorCode?: unknown;
    errorInfo?: string;
}
class WaclRuntimeLoader {
    private readonly sessionBaseUrl: string;
    private runtimeApi: WaclInterpreterApi | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl.replace(/\/+$/, "");
    }
    get interpreterApi(): WaclInterpreterApi {
        if (!this.runtimeApi) {
            throw new Error("Tcl runtime not loaded. Call loadRuntimeModule first.");
        }
        return this.runtimeApi;
    }
    get runtimeBaseUrl(): string {
        return `${this.sessionBaseUrl}/runtime/${TCL_RUNTIME_DIRECTORY_NAME}/`;
    }
    async loadRuntimeModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Tcl runtime.");
        const scriptResponse = await fetch(`${this.runtimeBaseUrl}${WACL_SCRIPT_FILE_NAME}`);
        if (!scriptResponse.ok) {
            throw new Error("Tcl runtime file wacl.js is missing. Run pnpm run setup.");
        }
        const patchedText = patchWaclModuleText(await scriptResponse.text(), this.runtimeBaseUrl);
        const amdModule = await evaluateAmdModule(patchedText, this.runtimeBaseUrl);
        await new Promise<void>((resolveReady) => {
            amdModule.onReady((api) => {
                this.runtimeApi = api;
                resolveReady();
            });
        });
    }
}
function patchWaclModuleText(sourceText: string, runtimeBaseUrl: string): string {
    const markers = [
        'var REMOTE_PACKAGE_BASE="wacl-library.data"',
        'var REMOTE_PACKAGE_BASE="wacl-custom.data"',
    ] as const;
    for (const marker of markers) {
        if (!sourceText.includes(marker)) {
            throw new Error("Tcl runtime file wacl.js does not match the expected layout.");
        }
    }
    return sourceText
        .replace(/eval\("[^"]*"\)/, "({})")
        .replace(markers[0], `var REMOTE_PACKAGE_BASE="${runtimeBaseUrl}wacl-library.data"`)
        .replace(markers[1], `var REMOTE_PACKAGE_BASE="${runtimeBaseUrl}wacl-custom.data"`);
}
async function evaluateAmdModule(
    moduleText: string,
    runtimeBaseUrl: string,
): Promise<WaclAmdModule> {
    const globalScope = window as unknown as {
        define?: unknown;
        require?: unknown;
    };
    const previousDefine = globalScope.define;
    const previousRequire = globalScope.require;
    let capturedModule: WaclAmdModule | undefined;
    globalScope.define = (_name: string, factory: () => WaclAmdModule) => {
        capturedModule = factory();
    };
    globalScope.require = {
        toUrl: (modulePath: string) => modulePath.replace(/^tcl\//, runtimeBaseUrl),
    };
    try {
        await new Promise<void>((resolveLoad, rejectLoad) => {
            const scriptElement = document.createElement("script");
            scriptElement.textContent = moduleText;
            scriptElement.addEventListener("load", () => resolveLoad(), { once: true });
            scriptElement.addEventListener(
                "error",
                () => rejectLoad(new Error("Tcl runtime script failed to evaluate.")),
                { once: true },
            );
            document.head.appendChild(scriptElement);
        });
    } finally {
        globalScope.define = previousDefine;
        globalScope.require = previousRequire;
    }
    if (!capturedModule) {
        throw new Error("Tcl runtime script did not register its module.");
    }
    return capturedModule;
}
class TclFedLineReader {
    private readonly fedLines: ReadonlyArray<string>;
    private fedIndex = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    readLine(): string {
        const fedLine = this.fedLines[this.fedIndex];
        if (fedLine === undefined) {
            throw new TerminalInputNeededSignal();
        }
        this.fedIndex += 1;
        return fedLine;
    }
}
function isTclInputInterruption(runError: unknown): boolean {
    if (isTerminalInputNeeded(runError)) {
        return true;
    }
    const details = runError as WaclTclException | undefined;
    const text = [details?.errorInfo, details?.errorCode, String(runError)]
        .filter((part) => typeof part === "string")
        .join("\n");
    return /input\/output error|POSIX EIO/.test(text);
}
class TclWaclPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: WaclRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new WaclRuntimeLoader(sessionBaseUrl);
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
        this.mountUserFilesIntoRuntime();
        stage.writeLine("Tcl runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const api = this.runtimeLoader.interpreterApi;
        const entrySourceText = this.userFiles.get(this.entryRelativePath) as string;
        const fedLines: Array<string> = [];
        stage.writeLine("Running Tcl script.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                api.stdout = (text: string) => {
                    this.outputTracker.appendText(`${text}\n`);
                };
                api.stderr = (text: string) => {
                    this.outputTracker.appendText(`${text}\n`);
                };
                this.installProgramArguments(api);
                const fedLineReader = new TclFedLineReader(fedLines);
                const previousPrompt = window.prompt;
                window.prompt = () => fedLineReader.readLine();
                try {
                    api.Eval(entrySourceText);
                } catch (runError) {
                    if (!isTclInputInterruption(runError)) {
                        throw new Error(this.describeTclError(runError));
                    }
                    inputWasNeeded = true;
                } finally {
                    window.prompt = previousPrompt;
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
    private mountUserFilesIntoRuntime(): void {
        const fileSystem = this.runtimeLoader.interpreterApi.Module;
        const encoder = new TextEncoder();
        for (const [relativePath, content] of this.userFiles) {
            const normalizedPath = normalizeWithinRoot(relativePath);
            const directory = directoryOf(normalizedPath);
            const fileName = normalizedPath.slice(
                directory.length === 0 ? 0 : directory.length + 1,
            );
            const parentPath = directory.length === 0 ? "/" : `/${directory}`;
            if (directory.length > 0) {
                fileSystem.FS_createPath("/", directory, true, true);
            }
            fileSystem.FS_createDataFile(parentPath, fileName, encoder.encode(content), true, true);
        }
    }
    private installProgramArguments(api: WaclInterpreterApi): void {
        const argumentList = this.programArguments
            .map((argument) => this.escapeTclArgument(argument))
            .join(" ");
        const entryName = this.entryRelativePath.split("/").pop() ?? this.entryRelativePath;
        api.Eval(`set argc ${this.programArguments.length}`);
        api.Eval(`set argv [list ${argumentList}]`);
        api.Eval(`set argv0 ${this.escapeTclArgument(entryName)}`);
    }
    private escapeTclArgument(value: string): string {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/\[/g, "\\[")}"`;
    }
    private describeTclError(runError: unknown): string {
        const details = runError as WaclTclException | undefined;
        const rawMessage =
            typeof details?.errorInfo === "string" && details.errorInfo.length > 0
                ? details.errorInfo
                : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const firstLine = messageLines[0] ?? rawMessage;
        const shapedLine = firstLine.length > 300 ? firstLine.slice(0, 300) : firstLine;
        return `Tcl error: ${shapedLine}`;
    }
}
export { TclWaclPerformer };
