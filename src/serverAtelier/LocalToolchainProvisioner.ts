import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
class LocalToolchainProvisioner {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly processRunner: ProcessRunner;
    private readonly scopedLogger: ScopedLogger;
    constructor(
        fileSystemOperations: FileSystemOperations,
        processRunner: ProcessRunner,
        scopedLogger: ScopedLogger,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.processRunner = processRunner;
        this.scopedLogger = scopedLogger;
    }
    async provisionEmscriptenSdk(): Promise<void> {
        const targetDirectory = "./.emsdk";
        if (
            await this.fileSystemOperations.pathExists(
                `${targetDirectory}/upstream/emscripten/emcc`,
            )
        ) {
            this.scopedLogger.logInformation("Emscripten SDK already provisioned, skipping.");
            return;
        }
        this.scopedLogger.logInformation("Cloning Emscripten SDK into ./.emsdk/.");
        const outcome = await this.processRunner.runToCompletion([
            "git",
            "clone",
            "--depth",
            "1",
            "https://github.com/emscripten-core/emsdk.git",
            targetDirectory,
        ]);
        if (outcome.exitCode !== 0) {
            this.scopedLogger.logWarning(`Emscripten clone failed: ${outcome.standardError}`);
        }
    }
    async provisionZigToolchain(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/zig", "Zig");
    }
    async provisionSwiftWasmToolchain(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/swift-wasm", "SwiftWasm");
    }
    async provisionKotlinWasmToolchain(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/kotlin-wasm", "KotlinWasm");
    }
    async provisionDartSdk(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/dart-sdk", "Dart");
    }
    async provisionDotNetSdk(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/dotnet", "DotNet");
    }
    async provisionTeaVmToolchain(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/teavm", "TeaVM");
    }
    async provisionOcamlWasmToolchain(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/ocaml-wasm", "OCamlWasm");
    }
    async provisionGhcWasmToolchain(): Promise<void> {
        await this.ensureDirectoryExists("./.tools/ghc-wasm", "GhcWasm");
    }
    async provisionAllToolchains(): Promise<void> {
        await this.provisionEmscriptenSdk();
        await this.provisionZigToolchain();
        await this.provisionSwiftWasmToolchain();
        await this.provisionKotlinWasmToolchain();
        await this.provisionDartSdk();
        await this.provisionDotNetSdk();
        await this.provisionTeaVmToolchain();
        await this.provisionOcamlWasmToolchain();
        await this.provisionGhcWasmToolchain();
    }
    private async ensureDirectoryExists(
        targetDirectory: string,
        toolchainName: string,
    ): Promise<void> {
        if (await this.fileSystemOperations.pathExists(targetDirectory)) {
            this.scopedLogger.logInformation(`${toolchainName} already provisioned, skipping.`);
            return;
        }
        await this.fileSystemOperations.ensureDirectoryExists(targetDirectory);
        this.scopedLogger.logWarning(
            `${toolchainName} placeholder created at ${targetDirectory}. Install the ${toolchainName} toolchain there.`,
        );
    }
}
export { LocalToolchainProvisioner };
