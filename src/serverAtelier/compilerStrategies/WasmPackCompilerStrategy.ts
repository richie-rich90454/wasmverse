import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
function cargoManifestText(packageName: string): string {
    return (
        "[package]\n" +
        `name = "${packageName}"\n` +
        'version = "0.1.0"\n' +
        'edition = "2021"\n' +
        "\n" +
        "[lib]\n" +
        'crate-type = ["cdylib"]\n' +
        "\n" +
        "[dependencies]\n" +
        'wasm-bindgen = "0.2"\n'
    );
}
function packageNameForSession(sessionIdentifier: string): string {
    const sanitized = sessionIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `showcase-${sanitized || "session"}`;
}
class WasmPackCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(processRunner: ProcessRunner, fileSystemOperations: FileSystemOperations) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        await this.ensureCargoProject(context);
        const wasmPackArguments = [
            "build",
            context.sourceDirectory,
            "--target",
            "web",
            "--out-dir",
            context.runtimeDirectory,
            "--out-name",
            "app",
        ];
        // `wasm-pack` is often absent but always runnable through `bunx`, so a
        // missing binary is not fatal. Prefer a real binary and fall back to bunx,
        // which downloads it on demand.
        const hasWasmPackOnPath = await this.isWasmPackOnPath();
        const wasmPackPrefix = hasWasmPackOnPath ? ["wasm-pack"] : ["bunx", "wasm-pack"];
        const outcome = await this.processRunner.runToCompletion(
            [...wasmPackPrefix, ...wasmPackArguments],
            { workingDirectory: context.sourceDirectory },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`wasm-pack build failed: ${detail}`);
        }
    }
    private async isWasmPackOnPath(): Promise<boolean> {
        try {
            const probe = await this.processRunner.runToCompletion([
                process.platform === "win32" ? "where" : "which",
                "wasm-pack",
            ]);
            return probe.exitCode === 0;
        } catch {
            return false;
        }
    }
    private async ensureCargoProject(context: BuildContextRecord): Promise<void> {
        const manifestPath = `${context.sourceDirectory}/Cargo.toml`;
        if (await this.fileSystemOperations.pathExists(manifestPath)) {
            return;
        }
        await this.fileSystemOperations.writeTextFile(
            manifestPath,
            cargoManifestText(packageNameForSession(context.sessionIdentifier)),
        );
        const entrySource = await this.fileSystemOperations.readTextFile(
            `${context.sourceDirectory}/${context.entryFileRelativePath}`,
        );
        await this.fileSystemOperations.writeTextFile(
            `${context.sourceDirectory}/src/lib.rs`,
            entrySource,
        );
    }
}
export { WasmPackCompilerStrategy };
