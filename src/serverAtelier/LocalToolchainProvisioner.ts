import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
const EMSCRIPTEN_SDK_VERSION = "6.0.10";
const DART_SDK_VERSION = "3.13.5";
const KOTLIN_VERSION = "2.4.20";
interface ArchiveToolchain {
    toolchainName: string;
    targetDirectory: string;
    binaryRelativePath: string;
    pathCommandName: string;
    archiveUrl: string;
    archiveRootDirectory: string;
}
/**
 * Toolchains that ship as a plain archive and can be unpacked into
 * `./.tools/<name>` without an installer.
 */
const ARCHIVE_TOOLCHAINS: ReadonlyArray<ArchiveToolchain> = [
    {
        toolchainName: "Dart",
        targetDirectory: "./.tools/dart-sdk",
        binaryRelativePath: "bin/dart",
        pathCommandName: "dart",
        archiveUrl: `https://storage.googleapis.com/dart-archive/channels/stable/release/${DART_SDK_VERSION}/sdk/dartsdk-windows-x64-release.zip`,
        archiveRootDirectory: "dart-sdk",
    },
    {
        toolchainName: "KotlinWasm",
        targetDirectory: "./.tools/kotlin-wasm",
        binaryRelativePath: "bin/kotlinc-wasm",
        pathCommandName: "kotlinc-wasm",
        archiveUrl: `https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip`,
        archiveRootDirectory: "kotlinc",
    },
];
class LocalToolchainProvisioner {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly processRunner: ProcessRunner;
    private readonly scopedLogger: ScopedLogger;
    private readonly toolchainLocator: ToolchainLocator;
    constructor(
        fileSystemOperations: FileSystemOperations,
        processRunner: ProcessRunner,
        scopedLogger: ScopedLogger,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.processRunner = processRunner;
        this.scopedLogger = scopedLogger;
        this.toolchainLocator = new ToolchainLocator(fileSystemOperations);
    }
    async provisionEmscriptenSdk(): Promise<void> {
        const targetDirectory = "./.emsdk";
        if (await this.emscriptenCompilerExists()) {
            this.scopedLogger.logInformation("Emscripten SDK already provisioned, skipping.");
            return;
        }
        if (!(await this.fileSystemOperations.pathExists(`${targetDirectory}/emsdk.py`))) {
            this.scopedLogger.logInformation("Cloning Emscripten SDK into ./.emsdk/.");
            const cloneOutcome = await this.processRunner.runToCompletion([
                "git",
                "clone",
                "--depth",
                "1",
                "https://github.com/emscripten-core/emsdk.git",
                targetDirectory,
            ]);
            if (cloneOutcome.exitCode !== 0) {
                this.scopedLogger.logWarning(
                    `Emscripten clone failed: ${cloneOutcome.standardError}`,
                );
                return;
            }
        }
        // Cloning only fetches the installer. Without installing and activating a
        // release there is no compiler, so C and C++ fail at build time even though
        // setup reported success.
        this.scopedLogger.logInformation(
            "Installing and activating the Emscripten SDK. This downloads a large toolchain once.",
        );
        const installOutcome = await this.processRunner.runToCompletion([
            "python",
            `${targetDirectory}/emsdk.py`,
            "install",
            EMSCRIPTEN_SDK_VERSION,
            "--activate",
        ]);
        if (installOutcome.exitCode !== 0) {
            this.scopedLogger.logWarning(
                `Emscripten install failed: ${installOutcome.standardError || installOutcome.standardOutput}`,
            );
            return;
        }
        if (!(await this.emscriptenCompilerExists())) {
            this.scopedLogger.logWarning(
                "Emscripten installed without producing a compiler under ./.emsdk/upstream/emscripten/.",
            );
        }
    }
    private async emscriptenCompilerExists(): Promise<boolean> {
        const compilerDirectory = "./.emsdk/upstream/emscripten";
        return (
            (await this.toolchainLocator.resolveExistingPath(`${compilerDirectory}/emcc`)) !==
            undefined
        );
    }
    async provisionDartSdk(): Promise<void> {
        await this.provisionArchiveToolchain(ARCHIVE_TOOLCHAINS[0] as ArchiveToolchain);
    }
    async provisionKotlinWasmToolchain(): Promise<void> {
        await this.provisionArchiveToolchain(ARCHIVE_TOOLCHAINS[1] as ArchiveToolchain);
    }
    /**
     * A toolchain already on `PATH` is used as is, so nothing is downloaded when
     * the developer has installed it themselves.
     */
    async provisionZigToolchain(): Promise<void> {
        await this.reportExternalToolchain("Zig", "./.tools/zig/zig", "zig");
    }
    /**
     * SwiftWasm is only published for Linux and macOS hosts, so on any other host
     * this reports why the plate is unavailable instead of downloading a host
     * Swift that still cannot target `wasm32-unknown-wasi`.
     */
    async provisionSwiftWasmToolchain(): Promise<void> {
        if (
            await this.reportExternalToolchain(
                "SwiftWasm",
                "./.tools/swift-wasm/usr/bin/swiftc",
                "swiftc",
            )
        ) {
            return;
        }
        if (process.platform === "win32") {
            this.scopedLogger.logWarning(
                "SwiftWasm is not published for Windows hosts, so the Swift plate cannot build here. Run the server on Linux or macOS with ./.tools/swift-wasm/ populated, and this plate will work unchanged.",
            );
        }
    }
    async provisionDotNetSdk(): Promise<void> {
        await this.reportExternalToolchain("DotNet", "./.tools/dotnet/dotnet", "dotnet");
        await this.provisionDotNetWasmWorkload();
    }
    async provisionTeaVmToolchain(): Promise<void> {
        await this.reportExternalToolchain("Maven", "mvn", "mvn");
    }
    async provisionOcamlWasmToolchain(): Promise<void> {
        if (
            await this.reportExternalToolchain(
                "OCamlWasm",
                "./.tools/ocaml-wasm/bin/ocamlopt",
                "ocamlopt",
            )
        ) {
            return;
        }
        if (process.platform === "win32") {
            this.scopedLogger.logWarning(
                "The OCaml wasm32-wasi cross compiler has no Windows build. Populate ./.tools/ocaml-wasm/ with a wasm32-wasi toolchain to enable that plate.",
            );
        }
    }
    async provisionGhcWasmToolchain(): Promise<void> {
        if (
            await this.reportExternalToolchain(
                "GhcWasm",
                "./.tools/ghc-wasm/bin/wasm32-wasi-ghc",
                "wasm32-wasi-ghc",
            )
        ) {
            return;
        }
        if (process.platform === "win32") {
            this.scopedLogger.logWarning(
                "GHC wasm32-wasi bindists are published for Linux and macOS only. Populate ./.tools/ghc-wasm/ to enable that plate.",
            );
        }
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
    private async provisionArchiveToolchain(toolchain: ArchiveToolchain): Promise<void> {
        if (
            await this.toolchainLocator.resolveExistingPath(
                `${toolchain.targetDirectory}/${toolchain.binaryRelativePath}`,
            )
        ) {
            this.scopedLogger.logInformation(
                `${toolchain.toolchainName} already provisioned, skipping.`,
            );
            return;
        }
        if (await this.isOnPath(toolchain.pathCommandName)) {
            this.scopedLogger.logSuccess(
                `${toolchain.toolchainName} found on PATH, using it instead of downloading.`,
            );
            return;
        }
        const archiveDirectory = join(
            tmpdir(),
            `wasmverse-${toolchain.toolchainName.toLowerCase()}`,
        );
        const archivePath = join(archiveDirectory, "toolchain.zip");
        const stagingDirectory = join(archiveDirectory, "unpacked");
        await this.fileSystemOperations.removeRecursively(archiveDirectory);
        this.scopedLogger.logInformation(
            `Downloading ${toolchain.toolchainName}. This fetches a large archive once.`,
        );
        try {
            const response = await fetch(toolchain.archiveUrl);
            if (!response.ok) {
                this.scopedLogger.logWarning(
                    `${toolchain.toolchainName} download failed with status ${response.status}. Install it manually under ${toolchain.targetDirectory}.`,
                );
                return;
            }
            await this.fileSystemOperations.writeBinaryFile(
                archivePath,
                new Uint8Array(await response.arrayBuffer()),
            );
            await this.fileSystemOperations.ensureDirectoryExists(stagingDirectory);
            const unpackOutcome = await this.processRunner.runToCompletion(
                [
                    process.platform === "win32" ? "powershell" : "unzip",
                    ...(process.platform === "win32"
                        ? [
                              "-NoProfile",
                              "-Command",
                              `Expand-Archive -Path '${archivePath}' -DestinationPath '${stagingDirectory}' -Force`,
                          ]
                        : ["-q", archivePath, "-d", stagingDirectory]),
                ],
                {},
            );
            if (unpackOutcome.exitCode !== 0) {
                this.scopedLogger.logWarning(
                    `${toolchain.toolchainName} unpack failed: ${unpackOutcome.standardError || unpackOutcome.standardOutput}`,
                );
                return;
            }
            await this.fileSystemOperations.removeRecursively(toolchain.targetDirectory);
            await this.fileSystemOperations.ensureDirectoryExists(toolchain.targetDirectory);
            await this.fileSystemOperations.copyDirectoryInto(
                `${stagingDirectory}/${toolchain.archiveRootDirectory}`,
                toolchain.targetDirectory,
            );
            if (
                !(await this.toolchainLocator.resolveExistingPath(
                    `${toolchain.targetDirectory}/${toolchain.binaryRelativePath}`,
                ))
            ) {
                this.scopedLogger.logWarning(
                    `${toolchain.toolchainName} unpacked without producing ${toolchain.binaryRelativePath}.`,
                );
                return;
            }
            this.scopedLogger.logSuccess(
                `${toolchain.toolchainName} provisioned at ${toolchain.targetDirectory}.`,
            );
        } finally {
            await this.fileSystemOperations.removeRecursively(archiveDirectory);
        }
    }
    private async provisionDotNetWasmWorkload(): Promise<void> {
        if (!(await this.isOnPath("dotnet"))) {
            return;
        }
        const listOutcome = await this.processRunner.runToCompletion([
            "dotnet",
            "workload",
            "list",
        ]);
        if (listOutcome.standardOutput.includes("wasm-tools")) {
            return;
        }
        this.scopedLogger.logInformation(
            "Installing the dotnet wasm-tools workload so C# can publish for the browser.",
        );
        const workloadOutcome = await this.processRunner.runToCompletion([
            "dotnet",
            "workload",
            "install",
            "wasm-tools",
        ]);
        if (workloadOutcome.exitCode !== 0) {
            this.scopedLogger.logWarning(
                `dotnet wasm-tools workload install failed: ${workloadOutcome.standardError}`,
            );
        }
    }
    private async reportExternalToolchain(
        toolchainName: string,
        localBinaryPath: string,
        pathCommandName: string,
    ): Promise<boolean> {
        const localBinary = await this.toolchainLocator.resolveExistingPath(localBinaryPath);
        if (localBinary) {
            this.scopedLogger.logInformation(
                `${toolchainName} already provisioned at ${localBinary}.`,
            );
            return true;
        }
        if (await this.isOnPath(pathCommandName)) {
            this.scopedLogger.logSuccess(`${toolchainName} found on PATH, using it.`);
            return true;
        }
        return false;
    }
    private async isOnPath(commandName: string): Promise<boolean> {
        try {
            const probeOutcome = await this.processRunner.runToCompletion([
                process.platform === "win32" ? "where" : "which",
                commandName,
            ]);
            return probeOutcome.exitCode === 0;
        } catch {
            return false;
        }
    }
}
export { LocalToolchainProvisioner };
export type { ArchiveToolchain };
