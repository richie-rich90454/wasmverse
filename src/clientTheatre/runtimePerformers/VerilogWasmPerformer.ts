import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
const VERILOG_GENERATION = "2005";
const VERILOG_RUNTIME_DIRECTORY_NAME = "verilog";
const BENIGN_COMPILER_MESSAGE_PATTERN =
    /system\.vpi|dynamic linking not enabled|wasm streaming compile failed|falling back to ArrayBuffer instantiation|instantiateStreaming/;
interface EmscriptenFileSystem {
    writeFile(path: string, contents: string | Uint8Array): void;
    readFile(path: string, options: { encoding: "utf8" }): string;
    readFile(path: string): Uint8Array;
    mkdir(path: string): void;
}
interface VerilogToolModule {
    FS: EmscriptenFileSystem;
    callMain(args: Array<string>): void;
}
interface VerilogToolModuleFactory {
    (config: {
        print: (text: string) => void;
        printErr: (text: string) => void;
        locateFile?: (fileName: string) => string;
    }): Promise<VerilogToolModule>;
}
interface VerilogToolModuleEntry {
    default: VerilogToolModuleFactory;
}
class VerilogWasmPerformer implements TerminalPerformerContract {
    private readonly assetLocator: RuntimeAssetLocator;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private ivlppFactory: VerilogToolModuleFactory | undefined;
    private ivlFactory: VerilogToolModuleFactory | undefined;
    private vvpFactory: VerilogToolModuleFactory | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading the Icarus Verilog WASM toolchain.");
        try {
            this.ivlppFactory = await this.loadToolFactory("ivlpp.js");
            this.ivlFactory = await this.loadToolFactory("ivl.js");
            this.vvpFactory = await this.loadToolFactory("vvp.js");
        } catch (loadError) {
            throw new Error(
                `Verilog runtime failed to load: ${this.describeVerilogError(loadError)}`,
            );
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Icarus Verilog toolchain ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.ivlppFactory || !this.ivlFactory || !this.vvpFactory) {
            throw new Error("Verilog runtime not loaded. Call loadInto first.");
        }
        stage.writeLine("Compiling and simulating the Verilog project.");
        this.outputTracker.beginRun();
        try {
            const preprocessedSource = await this.preprocessProject();
            if (!preprocessedSource.includes("$finish") && !preprocessedSource.includes("$stop")) {
                throw new Error(
                    "The testbench never calls $finish or $stop; add one so the simulation can end.",
                );
            }
            const compiledProgram = await this.compilePreprocessedSource(preprocessedSource);
            await this.simulateCompiledProgram(compiledProgram);
        } catch (runError) {
            throw new Error(this.describeVerilogError(runError));
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private async loadToolFactory(fileName: string): Promise<VerilogToolModuleFactory> {
        const runtimeModule = (await import(
            /* @vite-ignore */ this.assetLocator.resolveAssetUrl(
                `runtime/${VERILOG_RUNTIME_DIRECTORY_NAME}/${fileName}`,
            )
        )) as VerilogToolModuleEntry;
        if (typeof runtimeModule.default !== "function") {
            throw new Error(`${fileName} has no default export.`);
        }
        return runtimeModule.default;
    }
    private locateFile(fileName: string): string {
        return this.assetLocator.resolveAssetUrl(
            `runtime/${VERILOG_RUNTIME_DIRECTORY_NAME}/${fileName}`,
        );
    }
    private async preprocessProject(): Promise<string> {
        const sourceLines: Array<string> = [];
        const errorLines: Array<string> = [];
        const module = await (this.ivlppFactory as VerilogToolModuleFactory)({
            print: (text) => sourceLines.push(String(text)),
            printErr: (text) => errorLines.push(String(text)),
            locateFile: (fileName) => this.locateFile(fileName),
        });
        const sourcePaths = this.orderedSourcePaths();
        for (const relativePath of sourcePaths) {
            this.writeFileIntoFileSystem(
                module,
                `/${relativePath}`,
                this.userFiles.get(relativePath) as string,
            );
        }
        module.callMain(["-L", ...sourcePaths.map((relativePath) => `/${relativePath}`)]);
        const preprocessedSource = sourceLines.join("\n") + "\n";
        if (!preprocessedSource.includes("module")) {
            throw new Error(
                `Verilog preprocessing produced no modules: ${this.describeVerilogError(errorLines.join("\n")) || "no preprocessor output"}`,
            );
        }
        return preprocessedSource;
    }
    private async compilePreprocessedSource(preprocessedSource: string): Promise<Uint8Array> {
        const compilerMessages: Array<string> = [];
        const module = await (this.ivlFactory as VerilogToolModuleFactory)({
            print: () => {},
            printErr: (text) => compilerMessages.push(String(text)),
            locateFile: (fileName) => this.locateFile(fileName),
        });
        module.FS.writeFile("/ivl.conf", this.compilerConfiguration());
        module.FS.writeFile("/src.v", preprocessedSource);
        module.callMain(["-C/ivl.conf", "--", "/src.v"]);
        let compiledProgram: Uint8Array | undefined;
        try {
            compiledProgram = module.FS.readFile("/out.vvp");
        } catch {}
        const relevantMessages = compilerMessages
            .filter((message) => !BENIGN_COMPILER_MESSAGE_PATTERN.test(message))
            .join("\n");
        if (!compiledProgram) {
            throw new Error(
                `Verilog compilation failed: ${this.describeVerilogError(relevantMessages) || "no compiler output"}`,
            );
        }
        return compiledProgram;
    }
    private async simulateCompiledProgram(compiledProgram: Uint8Array): Promise<void> {
        const appendSimulationLine = (text: string): void => {
            if (!BENIGN_COMPILER_MESSAGE_PATTERN.test(text)) {
                this.outputTracker.appendText(text + "\n");
            }
        };
        const module = await (this.vvpFactory as VerilogToolModuleFactory)({
            print: (text) => appendSimulationLine(String(text)),
            printErr: (text) => appendSimulationLine(String(text)),
            locateFile: (fileName) => this.locateFile(fileName),
        });
        for (const relativePath of this.userFiles.keys()) {
            this.writeFileIntoFileSystem(
                module,
                `/${relativePath}`,
                this.userFiles.get(relativePath) as string,
            );
        }
        module.FS.writeFile("/sim.vvp", compiledProgram);
        const plusArguments = this.programArguments.map(
            (argumentValue, argumentIndex) => `+arg${argumentIndex}=${argumentValue}`,
        );
        module.callMain(["/sim.vvp", ...plusArguments]);
    }
    private orderedSourcePaths(): Array<string> {
        const sourceExtensions = [".v", ".sv", ".vh", ".svh"];
        const remainingPaths = [...this.userFiles.keys()]
            .filter(
                (relativePath) =>
                    relativePath !== this.entryRelativePath &&
                    sourceExtensions.some((sourceExtension) =>
                        relativePath.toLowerCase().endsWith(sourceExtension),
                    ),
            )
            .sort();
        return [this.entryRelativePath, ...remainingPaths];
    }
    private writeFileIntoFileSystem(
        module: VerilogToolModule,
        absolutePath: string,
        contents: string,
    ): void {
        const directorySegments = absolutePath.split("/").slice(1, -1);
        let activeDirectory = "";
        for (const directorySegment of directorySegments) {
            activeDirectory += `/${directorySegment}`;
            try {
                module.FS.mkdir(activeDirectory);
            } catch {}
        }
        module.FS.writeFile(absolutePath, contents);
    }
    private compilerConfiguration(): string {
        return [
            "basedir:/",
            "module:system.vpi",
            `generation:${VERILOG_GENERATION}`,
            "generation:no-specify",
            "out:/out.vvp",
            "iwidth:32",
            "widthcap:65536",
            "functor:cprop",
            "functor:nodangle",
            "flag:DLL=vvp.tgt",
            "",
        ].join("\n");
    }
    private describeVerilogError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const collapsedMessage = rawMessage
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join(" ");
        return collapsedMessage.length > 300 ? collapsedMessage.slice(0, 300) : collapsedMessage;
    }
}
export { VerilogWasmPerformer };
