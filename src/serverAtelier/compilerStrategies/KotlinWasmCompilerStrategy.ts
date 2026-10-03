import { dirname, resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
class KotlinWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly toolchainLocator: ToolchainLocator;
    private readonly kotlinCompilerPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        kotlinCompilerPath: string = "./.tools/kotlin-wasm/bin/kotlinc-wasm",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
        this.kotlinCompilerPath = kotlinCompilerPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const kotlinCompiler = await this.toolchainLocator.resolveCommandVector(
            this.kotlinCompilerPath,
            "kotlinc-wasm",
            "Kotlin/Wasm",
        );
        const intermediateDirectory = `${context.sourceDirectory}/kotlin-intermediate`;
        const linkedDirectory = `${context.sourceDirectory}/kotlin-linked`;
        // Resolved against the compiler home rather than the session directory,
        // because the compiler runs with that directory as its working directory.
        const stdlibPath = resolve(
            dirname(dirname(this.kotlinCompilerPath)),
            "lib",
            "kotlin-stdlib-wasm-wasi.klib",
        );
        // Kotlin's WASM compiler is a two pass tool. The first pass lowers sources
        // to a `.klib`, and only the second, which takes that klib through
        // `-Xinclude`, links the real `.wasm`. Running one pass writes a klib
        // where a module was expected and the browser gets nothing to run.
        const lowerOutcome = await this.processRunner.runToCompletion(
            [
                ...kotlinCompiler,
                context.entryFileRelativePath,
                "-Xwasm-target=wasm-wasi",
                "-libraries",
                stdlibPath,
                "-ir-output-dir",
                intermediateDirectory,
                "-ir-output-name",
                "app",
                "-Xir-module-name",
                "app",
                "-main",
                "call",
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (lowerOutcome.exitCode !== 0) {
            throw new Error(`Kotlin/Wasm lowering failed: ${lowerOutcome.standardError}`);
        }
        const linkOutcome = await this.processRunner.runToCompletion(
            [
                ...kotlinCompiler,
                "-Xwasm-target=wasm-wasi",
                `-Xinclude=${intermediateDirectory}/app.klib`,
                "-libraries",
                stdlibPath,
                "-Xir-produce-js",
                "-ir-output-dir",
                linkedDirectory,
                "-ir-output-name",
                "app",
                "-main",
                "call",
            ],
            { workingDirectory: context.sourceDirectory },
        );
        if (linkOutcome.exitCode !== 0) {
            throw new Error(`Kotlin/Wasm linking failed: ${linkOutcome.standardError}`);
        }
        if (!(await this.fileSystemOperations.pathExists(`${linkedDirectory}/app.wasm`))) {
            throw new Error("Kotlin/Wasm did not produce app.wasm.");
        }
        // Only the binary is shipped. The generated `app.mjs` is a Node loader
        // that reads the module off disk with `node:fs`, which a browser cannot
        // run, and object storage maps `.mjs` to a content type browsers reject.
        // The client instantiates `app.wasm` itself through the WASI performer.
        await this.fileSystemOperations.copyFileInto(
            `${linkedDirectory}/app.wasm`,
            `${context.runtimeDirectory}/app.wasm`,
        );
        await this.fileSystemOperations.removeRecursively(intermediateDirectory);
        await this.fileSystemOperations.removeRecursively(linkedDirectory);
    }
}
export { KotlinWasmCompilerStrategy };
