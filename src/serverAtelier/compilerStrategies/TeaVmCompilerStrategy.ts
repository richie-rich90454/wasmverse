import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class TeaVmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly teaVmDirectory: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        teaVmDirectory: string = "./.tools/teavm",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.teaVmDirectory = teaVmDirectory;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.teaVmDirectory);
        if (!toolchainExists) {
            throw new Error(
                "TeaVM toolchain not found. Run bun run setup to provision ./.tools/teavm/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            ["mvn", "-q", "package", `-Dteavm.output=${context.runtimeDirectory}`],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`TeaVM build failed: ${outcome.standardError}`);
        }
    }
}
export { TeaVmCompilerStrategy };
