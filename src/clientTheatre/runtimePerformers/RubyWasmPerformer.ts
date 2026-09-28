import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { encodeUserCodePath } from "@clientTheatre/runtimePerformers/UserCodeUrl.ts";
import { RubyVM } from "@ruby/wasm-wasi";
import {
    WASI,
    Fd,
    File,
    ConsoleStdout,
    PreopenDirectory,
    Directory,
    Inode,
    wasi,
} from "@bjorn3/browser_wasi_shim";
const TERMINAL_INPUT_MARKER = "TERMINAL_INPUT_NEEDED";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface RubyVmInstance {
    evalAsync(code: string): Promise<unknown>;
}
class TerminalStdinFile extends Fd {
    private fedChunks: Array<Uint8Array> = [];
    private chunkHead: number = 0;
    private headOffset: number = 0;
    private fedLength: number = 0;
    private consumedLength: number = 0;
    feedLine(line: string): void {
        const encoded = new TextEncoder().encode(line + "\n");
        this.fedChunks.push(encoded);
        this.fedLength += encoded.length;
    }
    override fd_fdstat_get(): { ret: number; fdstat: wasi.Fdstat | null } {
        return { ret: 0, fdstat: new wasi.Fdstat(wasi.FILETYPE_CHARACTER_DEVICE, 0) };
    }
    override fd_read(size: number): { ret: number; data: Uint8Array } {
        const availableLength = this.fedLength - this.consumedLength;
        if (availableLength <= 0) {
            return { ret: wasi.ERRNO_BADF, data: new Uint8Array(0) };
        }
        const takeLength = Math.min(Number(size), availableLength);
        const result = new Uint8Array(takeLength);
        let filledLength = 0;
        while (filledLength < takeLength) {
            const headChunk = this.fedChunks[this.chunkHead] as Uint8Array;
            const chunkAvailable = headChunk.length - this.headOffset;
            const copyLength = Math.min(chunkAvailable, takeLength - filledLength);
            result.set(
                headChunk.subarray(this.headOffset, this.headOffset + copyLength),
                filledLength,
            );
            filledLength += copyLength;
            this.headOffset += copyLength;
            this.consumedLength += copyLength;
            if (this.headOffset >= headChunk.length) {
                this.chunkHead++;
                this.headOffset = 0;
            }
        }
        return { ret: 0, data: result };
    }
}
class RubyOutputDeltaTracker {
    private shownText: string = "";
    private runBuffer: string = "";
    private textDecoder: TextDecoder = new TextDecoder();
    beginRun(): void {
        this.runBuffer = "";
    }
    appendBytes(bytes: Uint8Array): void {
        this.runBuffer += this.textDecoder.decode(bytes, { stream: true });
    }
    flushShownInto(stage: TerminalStageController): void {
        const sharedPrefixLength = this.commonPrefixLength(this.shownText, this.runBuffer);
        const newText = this.runBuffer.slice(sharedPrefixLength);
        this.shownText += newText;
        if (newText) {
            stage.writeText(newText);
        }
    }
    private commonPrefixLength(first: string, second: string): number {
        const shortestLength = Math.min(first.length, second.length);
        let sharedLength = 0;
        while (sharedLength < shortestLength && first[sharedLength] === second[sharedLength]) {
            sharedLength++;
        }
        return sharedLength;
    }
}
class RubyWasmLoader {
    private readonly sessionBaseUrl: string;
    private compiledModule: WebAssembly.Module | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntime(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Ruby runtime.");
        try {
            const binaryResponse = await fetch(`${this.sessionBaseUrl}/runtime/ruby.wasm`);
            if (!binaryResponse.ok) {
                throw new Error("Ruby binary is missing from the session.");
            }
            this.compiledModule = await WebAssembly.compile(await binaryResponse.arrayBuffer());
        } catch (loadError) {
            throw new Error(
                `Ruby runtime failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
        }
    }
    async instantiateWith(
        fedLines: ReadonlyArray<string>,
        userFiles: ReadonlyMap<string, string>,
        outputTracker: RubyOutputDeltaTracker,
    ): Promise<RubyVmInstance> {
        if (!this.compiledModule) {
            throw new Error("Ruby runtime not loaded. Call loadRuntime first.");
        }
        const stdinFile = new TerminalStdinFile();
        for (const fedLine of fedLines) {
            stdinFile.feedLine(fedLine);
        }
        const stdoutFile = new ConsoleStdout((bytes: Uint8Array) =>
            outputTracker.appendBytes(bytes),
        );
        const stderrFile = new ConsoleStdout((bytes: Uint8Array) =>
            outputTracker.appendBytes(bytes),
        );
        const rootDirectory = this.buildRootDirectory(userFiles);
        const wasiInstance = new WASI([], [], [stdinFile, stdoutFile, stderrFile, rootDirectory], {
            debug: false,
        });
        const { vm } = await RubyVM.instantiateModule({
            module: this.compiledModule,
            wasip1: wasiInstance,
        });
        return vm as RubyVmInstance;
    }
    private buildRootDirectory(userFiles: ReadonlyMap<string, string>): PreopenDirectory {
        const textEncoder = new TextEncoder();
        const rootEntries = new Map<string, Inode>();
        const directoryMaps = new Map<string, Map<string, Inode>>([["", rootEntries]]);
        const ensureDirectory = (directoryPath: string): Map<string, Inode> => {
            const existingDirectory = directoryMaps.get(directoryPath);
            if (existingDirectory) {
                return existingDirectory;
            }
            const parentPath = directoryPath.split("/").slice(0, -1).join("/");
            const parentEntries = ensureDirectory(parentPath);
            const childEntries = new Map<string, Inode>();
            parentEntries.set(
                directoryPath.split("/").pop() as string,
                new Directory(childEntries),
            );
            directoryMaps.set(directoryPath, childEntries);
            return childEntries;
        };
        for (const [relativePath, fileContent] of userFiles) {
            const pathSegments = relativePath.split("/");
            const fileName = pathSegments.pop() as string;
            const containingDirectory = ensureDirectory(pathSegments.join("/"));
            containingDirectory.set(fileName, new File(textEncoder.encode(fileContent)));
        }
        return new PreopenDirectory("/", new Map<string, Inode>(rootEntries));
    }
}
class RubyWasmFileSystemWriter {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async fetchUserFiles(): Promise<{
        entryRelativePath: string;
        userFiles: Map<string, string>;
    }> {
        const manifestResponse = await fetch(`${this.sessionBaseUrl}/user-code/manifest.json`);
        if (!manifestResponse.ok) {
            throw new Error("Session manifest is missing. Rebuild the session and retry.");
        }
        const manifest = (await manifestResponse.json()) as {
            entryFileRelativePath: string;
            includedFileRelativePaths: Array<string>;
        };
        const userFiles = new Map<string, string>();
        for (const relativePath of manifest.includedFileRelativePaths) {
            if (relativePath === "manifest.json") {
                continue;
            }
            const fileResponse = await fetch(
                `${this.sessionBaseUrl}/user-code/${encodeUserCodePath(relativePath)}`,
            );
            if (!fileResponse.ok) {
                throw new Error(`User file ${relativePath} is missing from the session.`);
            }
            const fileName = relativePath;
            userFiles.set(fileName, await fileResponse.text());
        }
        return { entryRelativePath: manifest.entryFileRelativePath, userFiles };
    }
}
class RubyWasmEntryExecutor {
    private readonly runtimeLoader: RubyWasmLoader;
    private readonly outputTracker: RubyOutputDeltaTracker;
    constructor(runtimeLoader: RubyWasmLoader, outputTracker: RubyOutputDeltaTracker) {
        this.runtimeLoader = runtimeLoader;
        this.outputTracker = outputTracker;
    }
    async executeEntry(
        entryRelativePath: string,
        userFiles: ReadonlyMap<string, string>,
        stage: TerminalStageController,
    ): Promise<void> {
        const fedLines: Array<string> = [];
        const wrapperSource = `class TerminalInputNeeded < StandardError\nend\nbegin\n  load '/${entryRelativePath}'\nrescue Errno::EBADF\n  raise TerminalInputNeeded, "${TERMINAL_INPUT_MARKER}"\nend\n`;
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            try {
                const rubyVm = await this.runtimeLoader.instantiateWith(
                    fedLines,
                    userFiles,
                    this.outputTracker,
                );
                await rubyVm.evalAsync(wrapperSource);
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                const errorMessage = String(
                    (runError as { message?: unknown })?.message ?? runError,
                );
                if (errorMessage.includes(TERMINAL_INPUT_MARKER)) {
                    const line = await stage.readLine("");
                    fedLines.push(line);
                    continue;
                }
                throw new Error(this.describeRubyError(errorMessage));
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
    private describeRubyError(errorMessage: string): string {
        const messageLines = errorMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        return messageLines.join("\n").slice(0, 900);
    }
}
class RubyWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: RubyWasmLoader;
    private readonly fileSystemWriter: RubyWasmFileSystemWriter;
    private readonly entryExecutor: RubyWasmEntryExecutor;
    private entryRelativePath: string = "";
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new RubyWasmLoader(sessionBaseUrl);
        this.fileSystemWriter = new RubyWasmFileSystemWriter(sessionBaseUrl);
        this.entryExecutor = new RubyWasmEntryExecutor(
            this.runtimeLoader,
            new RubyOutputDeltaTracker(),
        );
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.runtimeLoader.loadRuntime(stage);
        const fetchedFiles = await this.fileSystemWriter.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Ruby runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.entryExecutor.executeEntry(this.entryRelativePath, this.userFiles, stage);
    }
}
export { RubyWasmPerformer };
