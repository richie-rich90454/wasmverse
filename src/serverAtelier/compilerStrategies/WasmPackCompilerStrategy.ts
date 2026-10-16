import { delimiter, resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
const WASM_PACK_BINARY_PATH = "./.tools/wasm-pack/wasm-pack";
const RUST_CARGO_BINARY_PATH = "./.tools/cargo/bin/cargo";
const RUST_CARGO_DIRECTORY = "./.tools/cargo";
const RUST_RUSTUP_DIRECTORY = "./.tools/rustup";
const WASM_PACK_CACHE_DIRECTORY = "./.tools/wasm-pack-cache";
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
    private readonly toolchainLocator: ToolchainLocator;
    constructor(processRunner: ProcessRunner, fileSystemOperations: FileSystemOperations) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        await this.ensureCargoProject(context);
        // The provisioned binary is preferred, but a wasm-pack on PATH is used
        // when ./.tools/ was never populated, so the plate works without setup.
        const wasmPackCommand = await this.toolchainLocator.resolveCommandVector(
            WASM_PACK_BINARY_PATH,
            "wasm-pack",
            "wasm-pack",
        );
        const usesProvisionedWasmPack = wasmPackCommand[0] !== "wasm-pack";
        let environmentOverrides: Record<string, string> | undefined;
        if (usesProvisionedWasmPack) {
            if (!(await this.toolchainLocator.resolveExistingPath(RUST_CARGO_BINARY_PATH))) {
                throw new Error(
                    "Rust toolchain not found. Run pnpm run setup to provision ./.tools/cargo/.",
                );
            }
            const cargoHomeDirectory = resolve(process.cwd(), RUST_CARGO_DIRECTORY);
            environmentOverrides = {
                CARGO_HOME: cargoHomeDirectory,
                RUSTUP_HOME: resolve(process.cwd(), RUST_RUSTUP_DIRECTORY),
                WASM_PACK_CACHE: resolve(process.cwd(), WASM_PACK_CACHE_DIRECTORY),
                PATH: `${resolve(cargoHomeDirectory, "bin")}${delimiter}${process.env.PATH ?? ""}`,
            };
        }
        const outcome = await this.processRunner.runToCompletion(
            [
                ...wasmPackCommand,
                "build",
                context.sourceDirectory,
                "--target",
                "web",
                "--out-dir",
                context.runtimeDirectory,
                "--out-name",
                "app",
            ],
            {
                workingDirectory: context.sourceDirectory,
                ...(environmentOverrides ? { environmentOverrides } : {}),
            },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`wasm-pack build failed: ${detail}`);
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
