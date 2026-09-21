import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class OcamlWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly ocamlCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        ocamlCompilerPath: string = "./.tools/ocaml-wasm/bin/ocamlopt",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.ocamlCompilerPath = ocamlCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.ocamlCompilerPath);
        if (!toolchainExists) {
            throw new Error(
                "OCaml WASM toolchain not found. Run bun run setup to provision ./.tools/ocaml-wasm/.",
            );
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                this.ocamlCompilerPath,
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
                context.entryFileRelativePath,
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`OCaml WASM build failed: ${outcome.standardError}`);
        }
    }
}
export { OcamlWasmCompilerStrategy };
