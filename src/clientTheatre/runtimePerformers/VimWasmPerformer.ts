import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const VIM_RUNTIME_DIRECTORY_NAME = "vim-wasm";
const VIM_ARGUMENT_FILE_PATH = "/wasmverse-args.txt";
const VIM_RESULT_FILE_PATH = "/result.txt";
interface VimToolModule {
    cwrap(
        name: string,
        returnType: string | null,
        argumentTypes: ReadonlyArray<string>,
    ): (...args: ReadonlyArray<number>) => unknown;
    _malloc(byteCount: number): number;
    HEAPU8: Uint8Array;
}
interface VimFileSystem {
    writeFile(path: string, contents: string): void;
    readFile(path: string, options: { encoding: "utf8" }): string;
    mkdir(path: string): void;
    unlink(path: string): void;
}
interface VimRuntimeHandle {
    module: VimToolModule;
    fileSystem: VimFileSystem;
}
interface VimHostWindow {
    Module?: Record<string, unknown>;
    FS?: VimFileSystem;
    emscriptenRuntimeInitialized?: Promise<void>;
    __wasmverseVimRuntime?: VimRuntimeHandle;
}
const vimOutputSink: { write(text: string): void } = { write: () => {} };
class VimWasmPerformer implements TerminalPerformerContract {
    private readonly sessionBaseUrl: string;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private runtimeHandle: VimRuntimeHandle | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading the Vim WebAssembly runtime.");
        this.runtimeHandle = await this.loadRuntimeHandle();
        vimOutputSink.write = (text) => this.outputTracker.appendText(text);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Vim runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.runtimeHandle) {
            throw new Error("Vim runtime not loaded. Call loadInto first.");
        }
        stage.writeLine("Running the Vim script.");
        this.outputTracker.beginRun();
        try {
            const { module, fileSystem } = this.runtimeHandle;
            for (const [relativePath, sourceText] of this.userFiles) {
                this.writeFileIntoFileSystem(fileSystem, `/${relativePath}`, sourceText);
            }
            const argumentText =
                this.programArguments.length > 0 ? this.programArguments.join("\n") + "\n" : "";
            fileSystem.writeFile(VIM_ARGUMENT_FILE_PATH, argumentText);
            try {
                fileSystem.unlink(VIM_RESULT_FILE_PATH);
            } catch {}
            const exitStatus = this.runVim(module, [
                "vim",
                "-es",
                "-u",
                "NONE",
                "-i",
                "NONE",
                "-S",
                `/${this.entryRelativePath}`,
            ]);
            this.appendResultFile(fileSystem);
            if (exitStatus !== 0) {
                throw new Error(
                    `Vim exited with status ${exitStatus}. Check the script output above.`,
                );
            }
        } catch (runError) {
            throw new Error(this.describeVimError(runError));
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private async loadRuntimeHandle(): Promise<VimRuntimeHandle> {
        const hostWindow = window as unknown as VimHostWindow;
        if (!hostWindow.__wasmverseVimRuntime) {
            hostWindow.Module = {
                print: (text: string) => vimOutputSink.write(String(text) + "\n"),
                printErr: (text: string) => vimOutputSink.write(String(text) + "\n"),
                locateFile: (fileName: string) =>
                    `${this.sessionBaseUrl}/runtime/${VIM_RUNTIME_DIRECTORY_NAME}/${fileName}`,
            };
            const scriptElement = document.createElement("script");
            scriptElement.src = `${this.sessionBaseUrl}/runtime/${VIM_RUNTIME_DIRECTORY_NAME}/vim.js`;
            const scriptLoaded = new Promise<void>((resolveLoaded, rejectLoaded) => {
                scriptElement.addEventListener("load", () => resolveLoaded(), { once: true });
                scriptElement.addEventListener(
                    "error",
                    () => rejectLoaded(new Error("the Vim runtime script failed to load")),
                    { once: true },
                );
            });
            document.head.appendChild(scriptElement);
            await scriptLoaded;
            if (!hostWindow.emscriptenRuntimeInitialized) {
                throw new Error("the Vim runtime did not start");
            }
            await hostWindow.emscriptenRuntimeInitialized;
            if (!hostWindow.Module || !hostWindow.FS) {
                throw new Error("the Vim runtime exposed no module or filesystem");
            }
            hostWindow.__wasmverseVimRuntime = {
                module: hostWindow.Module as unknown as VimToolModule,
                fileSystem: hostWindow.FS,
            };
        }
        return hostWindow.__wasmverseVimRuntime;
    }
    private runVim(module: VimToolModule, argumentList: ReadonlyArray<string>): number {
        const textEncoder = new TextEncoder();
        const encodedArguments = argumentList.map((argument) =>
            textEncoder.encode(argument + "\0"),
        );
        const totalBytes = encodedArguments.reduce((total, encoded) => total + encoded.length, 0);
        const argumentBytesPointer = module._malloc(totalBytes);
        const pointerTable = new Uint32Array(argumentList.length + 1);
        let writeOffset = 0;
        encodedArguments.forEach((encodedArgument, argumentIndex) => {
            module.HEAPU8.set(encodedArgument, argumentBytesPointer + writeOffset);
            pointerTable[argumentIndex] = argumentBytesPointer + writeOffset;
            writeOffset += encodedArgument.length;
        });
        const pointerTablePointer = module._malloc(pointerTable.byteLength);
        module.HEAPU8.set(new Uint8Array(pointerTable.buffer), pointerTablePointer);
        const wasmMain = module.cwrap("wasm_main", null, ["number", "number"]);
        try {
            wasmMain(argumentList.length, pointerTablePointer);
            return 0;
        } catch (exitSignal) {
            const shapedSignal = exitSignal as { name?: string; status?: unknown } | undefined;
            if (shapedSignal?.name === "ExitStatus") {
                return Number(shapedSignal.status ?? 0);
            }
            throw exitSignal;
        }
    }
    private appendResultFile(fileSystem: VimFileSystem): void {
        try {
            this.outputTracker.appendText(
                fileSystem.readFile(VIM_RESULT_FILE_PATH, { encoding: "utf8" }),
            );
        } catch {}
    }
    private writeFileIntoFileSystem(
        fileSystem: VimFileSystem,
        absolutePath: string,
        contents: string,
    ): void {
        const directorySegments = absolutePath.split("/").slice(1, -1);
        let activeDirectory = "";
        for (const directorySegment of directorySegments) {
            activeDirectory += `/${directorySegment}`;
            try {
                fileSystem.mkdir(activeDirectory);
            } catch {}
        }
        fileSystem.writeFile(absolutePath, contents);
    }
    private describeVimError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const collapsedMessage = rawMessage
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join(" ");
        return collapsedMessage.length > 300 ? collapsedMessage.slice(0, 300) : collapsedMessage;
    }
}
export { VimWasmPerformer };
