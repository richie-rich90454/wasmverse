import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const DEFAULT_DART_BINARY_PATH =
    process.platform === "win32" ? "./.tools/dart-sdk/bin/dart.exe" : "./.tools/dart-sdk/bin/dart";
class DartWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly dartBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        dartBinaryPath: string = DEFAULT_DART_BINARY_PATH,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.dartBinaryPath = dartBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.dartBinaryPath))) {
            throw new Error(
                "Dart SDK not found. Run pnpm run setup to provision ./.tools/dart-sdk/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                this.dartBinaryPath,
                "compile",
                "wasm",
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
            throw new Error(`Dart WASM build failed: ${detail}`);
        }
        await this.fileSystemOperations.moveInto(
            `${context.runtimeDirectory}/app.mjs`,
            `${context.runtimeDirectory}/app.wasm.js`,
        );
    }
}
export { DartWasmCompilerStrategy };
