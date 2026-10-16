import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
const WASI_TARGET = "wasm32-unknown-wasi";
class SwiftWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly swiftCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        swiftCompilerPath: string = "./.tools/swift-wasm/usr/bin/swiftc",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.swiftCompilerPath = swiftCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const swiftCompiler = await this.toolchainLocator.resolveCommandVector(
            this.swiftCompilerPath,
            "swiftc",
            "SwiftWasm",
        );
        // SwiftWasm is published for Linux and macOS hosts only. A host Swift has a
        // `swiftc` but no WASI standard library, so it is refused here rather than
        // failing deep inside the compiler with a missing dependency.
        if (!(await this.canTargetWasi())) {
            throw new Error(
                "SwiftWasm toolchain is not provisioned. It is published for Linux and macOS hosts only, so run the server on one of those with ./.tools/swift-wasm/ populated, or add swiftc from a SwiftWasm toolchain to PATH.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                ...swiftCompiler,
                "-target",
                WASI_TARGET,
                context.entryFileRelativePath,
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`SwiftWasm build failed: ${detail}`);
        }
    }
    /**
     * A toolchain that can target WASI carries its standard library under
     * `usr/lib/swift/wasi`. Without it the compiler stops with
     * "missing external dependency ... static-executable-args.lnk".
     */
    private async canTargetWasi(): Promise<boolean> {
        const toolchainBinaryDirectory = this.swiftCompilerPath.slice(
            0,
            this.swiftCompilerPath.lastIndexOf("/bin/"),
        );
        if (toolchainBinaryDirectory.length === this.swiftCompilerPath.length) {
            return true;
        }
        return this.fileSystemOperations.pathExists(
            `${toolchainBinaryDirectory}/../lib/swift/wasi/static-executable-args.lnk`,
        );
    }
}
export { SwiftWasmCompilerStrategy };
