import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class TeaVmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly teaVmDirectory: string;
    private readonly mavenBinaryName: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        teaVmDirectory: string = "./.tools/teavm",
        mavenBinaryName: string = process.platform === "win32" ? "mvn.cmd" : "mvn",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.teaVmDirectory = teaVmDirectory;
        this.mavenBinaryName = mavenBinaryName;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.teaVmDirectory);
        if (!toolchainExists) {
            throw new Error(
                "TeaVM toolchain not found. Run bun run setup to provision ./.tools/teavm/.",
            );
        }
        let outcome;
        try {
            outcome = await this.processRunner.runToCompletion(
                [this.mavenBinaryName, "-q", "package", `-Dteavm.output=${context.runtimeDirectory}`],
                { workingDirectory: context.sourceDirectory },
            );
        } catch {
            throw new Error(
                "Maven executable not found. Install Maven and ensure mvn is on PATH to build Java programs.",
            );
        }
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`TeaVM build failed: ${detail}`);
        }
    }
}
export { TeaVmCompilerStrategy };
