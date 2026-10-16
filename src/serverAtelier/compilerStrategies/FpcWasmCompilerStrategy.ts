import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const FPC_COMPILER_CANDIDATE_PATHS: ReadonlyArray<string> = [
    "./.tools/fpc/bin/x86_64-win64/ppcrosswasm32.exe",
    "./.tools/fpc/bin/x86_64-win64/ppcrosswasm32",
    "./.tools/fpc/bin/x86_64-linux/ppcrosswasm32",
    "./.tools/fpc/bin/x86_64-darwin/ppcrosswasm32",
    "./.tools/fpc/fpc",
    "./.tools/fpc/bin/fpc",
];
const EMITTED_WASM_FILE_NAME = "app.wasm";
class FpcWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly fpcCompilerPath: string | undefined;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        fpcCompilerPath?: string,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.fpcCompilerPath = fpcCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const compilerPath = await this.resolveCompilerPath();
        const outcome = await this.processRunner.runToCompletion(
            [compilerPath, "-O2", `-FE${context.runtimeDirectory}`, context.entryFileRelativePath],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Free Pascal WASM build failed: ${outcome.standardError}`);
        }
        await this.promoteEmittedWasm(context);
    }
    private async resolveCompilerPath(): Promise<string> {
        if (this.fpcCompilerPath) {
            if (await this.fileSystemOperations.pathExists(this.fpcCompilerPath)) {
                return this.fpcCompilerPath;
            }
            throw new Error(
                "Free Pascal WASM toolchain not found. Run pnpm run setup to provision ./.tools/fpc/.",
            );
        }
        for (const candidatePath of FPC_COMPILER_CANDIDATE_PATHS) {
            if (await this.fileSystemOperations.pathExists(candidatePath)) {
                return candidatePath;
            }
        }
        throw new Error(
            "Free Pascal WASM toolchain not found. Run pnpm run setup to provision ./.tools/fpc/.",
        );
    }
    private async promoteEmittedWasm(context: BuildContextRecord): Promise<void> {
        if (
            await this.fileSystemOperations.pathExists(
                `${context.runtimeDirectory}/${EMITTED_WASM_FILE_NAME}`,
            )
        ) {
            return;
        }
        const runtimeFiles = await this.fileSystemOperations.listFilesRecursively(
            context.runtimeDirectory,
        );
        const emittedWasmFile = runtimeFiles.find((relativePath) => relativePath.endsWith(".wasm"));
        if (!emittedWasmFile) {
            throw new Error("Free Pascal produced no wasm file for the entry program.");
        }
        await this.fileSystemOperations.copyFileInto(
            `${context.runtimeDirectory}/${emittedWasmFile}`,
            `${context.runtimeDirectory}/${EMITTED_WASM_FILE_NAME}`,
        );
    }
}
export { FpcWasmCompilerStrategy };
