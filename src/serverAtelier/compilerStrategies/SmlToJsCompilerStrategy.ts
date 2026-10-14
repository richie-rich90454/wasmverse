import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const SML_HOST_PRELUDE = [
    "var print = wasmversePrint;",
    "var use = function (path) { throw new Error('use is not available at runtime: ' + path); };",
    "",
].join("\n");
class SmlToJsCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly smlToJsCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        smlToJsCompilerPath: string = "./.tools/sml/bin/smltojs",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.smlToJsCompilerPath = smlToJsCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(
            this.smlToJsCompilerPath,
        );
        if (!toolchainExists) {
            throw new Error(
                "Standard ML toolchain not found. Run pnpm run setup to provision ./.tools/sml/.",
            );
        }
        const outputPath = `${context.runtimeDirectory}/app.js`;
        const outcome = await this.processRunner.runToCompletion(
            [this.smlToJsCompilerPath, "-o", outputPath, context.entryFileRelativePath],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Standard ML build failed: ${outcome.standardError}`);
        }
        const compiledSource = await this.fileSystemOperations.readTextFile(outputPath);
        await this.fileSystemOperations.writeTextFile(
            outputPath,
            `${SML_HOST_PRELUDE}${compiledSource}`,
        );
    }
}
export { SML_HOST_PRELUDE, SmlToJsCompilerStrategy };
