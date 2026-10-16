import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
class OcamlWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly ocamlCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        ocamlCompilerPath: string = "./.tools/ocaml-wasm/bin/ocamlopt",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.ocamlCompilerPath = ocamlCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const ocamlCompiler = await this.toolchainLocator.resolveCommandVector(
            this.ocamlCompilerPath,
            "ocamlopt",
            "OCaml WASM",
        );
        const outcome = await this.processRunner.runToCompletion(
            [
                ...ocamlCompiler,
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
                context.entryFileRelativePath,
                "-linkall",
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`OCaml WASM build failed: ${detail}`);
        }
    }
}
export { OcamlWasmCompilerStrategy };
