import { unzipSync } from "fflate";
import { resolve } from "node:path";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
const EMSCRIPTEN_SDK_ARCHIVE_URL =
    "https://github.com/emscripten-core/emsdk/archive/refs/heads/main.zip";
const EMSCRIPTEN_SDK_ARCHIVE_FILE_NAME = "emsdk-main.zip";
const EMSCRIPTEN_DIRECTORY = "./.emsdk";
const EMSCRIPTEN_COMPILER_PATHS: ReadonlyArray<string> = [
    `${EMSCRIPTEN_DIRECTORY}/upstream/emscripten/emcc`,
    `${EMSCRIPTEN_DIRECTORY}/upstream/emscripten/emcc.bat`,
];
const GO_VERSION = "1.27.2";
const GO_DIRECTORY = "./.tools/go";
const GO_BINARY_PATH = `${GO_DIRECTORY}/bin/go.exe`;
const GO_WINDOWS_X64_ARCHIVE_URL = `https://go.dev/dl/go${GO_VERSION}.windows-amd64.zip`;
const ZIG_VERSION = "0.17.0";
const ZIG_DIRECTORY = "./.tools/zig";
const ZIG_BINARY_PATH = `${ZIG_DIRECTORY}/zig`;
const ZIG_WINDOWS_X64_ARCHIVE_URL = `https://ziglang.org/download/${ZIG_VERSION}/zig-x86_64-windows-${ZIG_VERSION}.zip`;
const WASM_PACK_VERSION = "0.15.0";
const WASM_PACK_DIRECTORY = "./.tools/wasm-pack";
const WASM_PACK_BINARY_PATH = `${WASM_PACK_DIRECTORY}/wasm-pack.exe`;
const WASM_PACK_WINDOWS_X64_ARCHIVE_URL = `https://github.com/wasm-bindgen/wasm-pack/releases/download/v${WASM_PACK_VERSION}/wasm-pack-v${WASM_PACK_VERSION}-x86_64-pc-windows-msvc.tar.gz`;
const RUSTUP_INIT_URL =
    "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe";
const RUST_CARGO_DIRECTORY = "./.tools/cargo";
const RUST_CARGO_BINARY_PATH = `${RUST_CARGO_DIRECTORY}/bin/cargo.exe`;
const RUST_RUSTUP_DIRECTORY = "./.tools/rustup";
const JDK_DIRECTORY = "./.tools/jdk";
const JDK_BINARY_PATH = `${JDK_DIRECTORY}/bin/java.exe`;
const JDK_WINDOWS_X64_ARCHIVE_URL =
    "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse";
const MAVEN_VERSION = "3.9.16";
const MAVEN_DIRECTORY = "./.tools/maven";
const MAVEN_BINARY_PATH = `${MAVEN_DIRECTORY}/bin/mvn.cmd`;
const MAVEN_WINDOWS_X64_ARCHIVE_URL = `https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.zip`;
const CHROME_FOR_TESTING_DIRECTORY = "./.tools/chrome-for-testing";
const CHROME_FOR_TESTING_BINARY_PATH = `${CHROME_FOR_TESTING_DIRECTORY}/chrome.exe`;
const CHROME_FOR_TESTING_VERSIONS_URL =
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
const DART_VERSION = "3.13.5";
const DART_DIRECTORY = "./.tools/dart-sdk";
const DART_BINARY_PATH = `${DART_DIRECTORY}/bin/dart`;
const DART_WINDOWS_X64_ARCHIVE_URL = `https://storage.googleapis.com/dart-archive/channels/stable/release/${DART_VERSION}/sdk/dartsdk-windows-x64-release.zip`;
const DOTNET_SDK_VERSION = "10.0.401";
const DOTNET_DIRECTORY = "./.tools/dotnet";
const DOTNET_BINARY_PATH = `${DOTNET_DIRECTORY}/dotnet`;
const DOTNET_WINDOWS_X64_ARCHIVE_URL = `https://builds.dotnet.microsoft.com/dotnet/Sdk/${DOTNET_SDK_VERSION}/dotnet-sdk-${DOTNET_SDK_VERSION}-win-x64.zip`;
const KOTLIN_VERSION = "2.4.21";
const KOTLIN_DIRECTORY = "./.tools/kotlin-wasm";
const KOTLIN_COMPILER_PATH = `${KOTLIN_DIRECTORY}/bin/kotlinc-js`;
const KOTLIN_WINDOWS_X64_ARCHIVE_URL = `https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip`;
const GHC_WASM_DIRECTORY = "./.tools/ghc-wasm";
const GHC_WASM_COMPILER_PATH = `${GHC_WASM_DIRECTORY}/bin/wasm32-wasi-ghc`;
const GHC_WASM_GMP_BINDIST_URL =
    "https://github.com/haskell-wasm/ghc-wasm-bindists/releases/download/20260731T193144/wasm32-wasi-ghc-gmp.tar.xz";
const SWIFT_WASM_DIRECTORY = "./.tools/swift-wasm";
const SWIFT_COMPILER_PATH = `${SWIFT_WASM_DIRECTORY}/usr/bin/swiftc`;
const OCAML_DIRECTORY = "./.tools/ocaml-wasm";
const OCAML_COMPILER_PATH = `${OCAML_DIRECTORY}/bin/ocamlopt`;
const TEAVM_DIRECTORY = "./.tools/teavm";
const WINDOWS_EXECUTABLE_EXTENSIONS: ReadonlyArray<string> = [".exe", ".bat", ".cmd"];
interface ArchiveToolchainSpec {
    toolchainName: string;
    archiveUrl: string;
    archiveFileName: string;
    targetDirectory: string;
    probePath: string;
    supportedPlatforms?: ReadonlyArray<NodeJS.Platform>;
}
interface ChromeForTestingDownloadEntry {
    platform: string;
    url: string;
}
interface ChromeForTestingVersionsPayload {
    channels: {
        Stable: {
            downloads: {
                chrome: ReadonlyArray<ChromeForTestingDownloadEntry>;
            };
        };
    };
}
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
class LocalToolchainProvisioner {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly processRunner: ProcessRunner;
    private readonly scopedLogger: ScopedLogger;
    private readonly platformName: NodeJS.Platform;
    constructor(
        fileSystemOperations: FileSystemOperations,
        processRunner: ProcessRunner,
        scopedLogger: ScopedLogger,
        platformName: NodeJS.Platform = process.platform,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.processRunner = processRunner;
        this.scopedLogger = scopedLogger;
        this.platformName = platformName;
    }
    async provisionEmscriptenSdk(): Promise<void> {
        for (const compilerPath of EMSCRIPTEN_COMPILER_PATHS) {
            if (await this.fileSystemOperations.pathExists(compilerPath)) {
                this.scopedLogger.logInformation("Emscripten SDK already provisioned, skipping.");
                return;
            }
        }
        try {
            if (!(await this.fileSystemOperations.pathExists(EMSCRIPTEN_DIRECTORY))) {
                this.scopedLogger.logInformation(
                    `Downloading Emscripten SDK from ${EMSCRIPTEN_SDK_ARCHIVE_URL}.`,
                );
                await this.installArchiveContentsInto(
                    EMSCRIPTEN_SDK_ARCHIVE_URL,
                    EMSCRIPTEN_SDK_ARCHIVE_FILE_NAME,
                    EMSCRIPTEN_DIRECTORY,
                );
            }
            for (const action of ["install", "activate"]) {
                this.scopedLogger.logInformation(`Running emsdk ${action} latest.`);
                const outcome =
                    this.platformName === "win32"
                        ? await this.processRunner.runToCompletion([
                              "cmd",
                              "/c",
                              ".\\.emsdk\\emsdk.bat",
                              action,
                              "latest",
                          ])
                        : await this.processRunner.runToCompletion([
                              "./.emsdk/emsdk",
                              action,
                              "latest",
                          ]);
                if (outcome.exitCode !== 0) {
                    this.scopedLogger.logWarning(
                        `Emscripten ${action} failed: ${outcome.standardError}`,
                    );
                    return;
                }
            }
            this.scopedLogger.logSuccess("Emscripten SDK installed and activated.");
        } catch (error) {
            this.scopedLogger.logWarning(`Emscripten provisioning failed: ${messageOf(error)}`);
        }
    }
    async provisionGoToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Go",
            archiveUrl: GO_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `go${GO_VERSION}.windows-amd64.zip`,
            targetDirectory: GO_DIRECTORY,
            probePath: GO_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionZigToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Zig",
            archiveUrl: ZIG_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `zig-${ZIG_VERSION}.zip`,
            targetDirectory: ZIG_DIRECTORY,
            probePath: ZIG_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionWasmPackToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "wasm-pack",
            archiveUrl: WASM_PACK_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `wasm-pack-v${WASM_PACK_VERSION}-x86_64-pc-windows-msvc.tar.gz`,
            targetDirectory: WASM_PACK_DIRECTORY,
            probePath: WASM_PACK_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionRustToolchain(): Promise<void> {
        if (await this.isToolchainPresent(RUST_CARGO_BINARY_PATH)) {
            this.scopedLogger.logInformation("Rust toolchain already provisioned, skipping.");
            return;
        }
        if (this.platformName !== "win32") {
            this.scopedLogger.logWarning(
                "Rust automatic provisioning is available for win32 only; install rustup manually.",
            );
            return;
        }
        const stagingDirectory = `${RUST_CARGO_DIRECTORY}-staging`;
        try {
            this.scopedLogger.logInformation(`Downloading rustup-init from ${RUSTUP_INIT_URL}.`);
            const installerBytes = await this.fetchArchiveContent(RUSTUP_INIT_URL);
            await this.fileSystemOperations.ensureDirectoryExists(stagingDirectory);
            const installerPath = `${stagingDirectory}/rustup-init.exe`;
            await this.fileSystemOperations.writeBinaryFile(installerPath, installerBytes);
            const cargoHomeDirectory = resolve(process.cwd(), RUST_CARGO_DIRECTORY);
            const outcome = await this.processRunner.runToCompletion(
                [
                    installerPath,
                    "-y",
                    "--no-modify-path",
                    "--default-toolchain",
                    "stable",
                    "--profile",
                    "minimal",
                    "--target",
                    "wasm32-unknown-unknown",
                ],
                {
                    environmentOverrides: {
                        CARGO_HOME: cargoHomeDirectory,
                        RUSTUP_HOME: resolve(process.cwd(), RUST_RUSTUP_DIRECTORY),
                    },
                },
            );
            if (outcome.exitCode !== 0) {
                this.scopedLogger.logWarning(
                    `rustup-init failed: ${outcome.standardError.trim() || outcome.standardOutput.trim()}`,
                );
                return;
            }
            this.scopedLogger.logSuccess(`Rust toolchain provisioned at ${RUST_CARGO_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`Rust provisioning failed: ${messageOf(error)}`);
        } finally {
            try {
                await this.fileSystemOperations.removeRecursively(stagingDirectory);
            } catch {}
        }
    }
    async provisionJdkToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Temurin JDK",
            archiveUrl: JDK_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: "temurin-jdk-windows-x64.zip",
            targetDirectory: JDK_DIRECTORY,
            probePath: JDK_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionMavenToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Apache Maven",
            archiveUrl: MAVEN_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `apache-maven-${MAVEN_VERSION}-bin.zip`,
            targetDirectory: MAVEN_DIRECTORY,
            probePath: MAVEN_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionChromeForTesting(): Promise<void> {
        if (await this.isToolchainPresent(CHROME_FOR_TESTING_BINARY_PATH)) {
            this.scopedLogger.logInformation("Chrome for Testing already provisioned, skipping.");
            return;
        }
        if (this.platformName !== "win32") {
            this.scopedLogger.logWarning(
                "Chrome for Testing automatic provisioning is available for win32 only; install Chrome manually for verification.",
            );
            return;
        }
        let downloadUrl: string | undefined;
        try {
            const response = await fetch(CHROME_FOR_TESTING_VERSIONS_URL);
            if (!response.ok) {
                throw new Error(
                    `version lookup from ${CHROME_FOR_TESTING_VERSIONS_URL} failed with HTTP ${response.status}`,
                );
            }
            const payload = (await response.json()) as ChromeForTestingVersionsPayload;
            downloadUrl = payload.channels.Stable.downloads.chrome.find(
                (entry) => entry.platform === "win64",
            )?.url;
        } catch (error) {
            this.scopedLogger.logWarning(
                `Chrome for Testing version lookup failed: ${messageOf(error)}`,
            );
            return;
        }
        if (!downloadUrl) {
            this.scopedLogger.logWarning(
                "Chrome for Testing has no win64 stable download in the version feed.",
            );
            return;
        }
        await this.installArchiveToolchain({
            toolchainName: "Chrome for Testing",
            archiveUrl: downloadUrl,
            archiveFileName: "chrome-win64.zip",
            targetDirectory: CHROME_FOR_TESTING_DIRECTORY,
            probePath: CHROME_FOR_TESTING_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionSwiftWasmToolchain(): Promise<void> {
        if (await this.isToolchainPresent(SWIFT_COMPILER_PATH)) {
            this.scopedLogger.logInformation("SwiftWasm already provisioned, skipping.");
            return;
        }
        await this.fileSystemOperations.ensureDirectoryExists(SWIFT_WASM_DIRECTORY);
        this.scopedLogger.logWarning(
            "SwiftWasm has no standalone release with usr/bin/swiftc. Official releases ship Swift SDK artifact bundles that require a host Swift toolchain and `swift sdk install`, which the SwiftWasm compiler strategy cannot use. Provision ./.tools/swift-wasm/usr/bin/swiftc manually.",
        );
    }
    async provisionKotlinWasmToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Kotlin/JS",
            archiveUrl: KOTLIN_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `kotlin-compiler-${KOTLIN_VERSION}.zip`,
            targetDirectory: KOTLIN_DIRECTORY,
            probePath: KOTLIN_COMPILER_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionDartSdk(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Dart SDK",
            archiveUrl: DART_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `dartsdk-windows-x64-release-${DART_VERSION}.zip`,
            targetDirectory: DART_DIRECTORY,
            probePath: DART_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionDotNetSdk(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "dotnet SDK",
            archiveUrl: DOTNET_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `dotnet-sdk-${DOTNET_SDK_VERSION}-win-x64.zip`,
            targetDirectory: DOTNET_DIRECTORY,
            probePath: DOTNET_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
        const dotNetBinaryPath = await this.resolvePresentBinaryPath(DOTNET_BINARY_PATH);
        if (!dotNetBinaryPath) {
            return;
        }
        try {
            const listOutcome = await this.processRunner.runToCompletion([
                dotNetBinaryPath,
                "workload",
                "list",
            ]);
            if (listOutcome.exitCode === 0 && listOutcome.standardOutput.includes("wasm-tools")) {
                this.scopedLogger.logInformation(
                    "dotnet wasm-tools workload already installed, skipping.",
                );
                return;
            }
            this.scopedLogger.logInformation("Installing dotnet wasm-tools workload.");
            const installOutcome = await this.processRunner.runToCompletion([
                dotNetBinaryPath,
                "workload",
                "install",
                "wasm-tools",
            ]);
            if (installOutcome.exitCode !== 0) {
                this.scopedLogger.logWarning(
                    `dotnet wasm-tools workload install failed: ${installOutcome.standardError}`,
                );
                return;
            }
            this.scopedLogger.logSuccess("dotnet wasm-tools workload installed.");
        } catch (error) {
            this.scopedLogger.logWarning(
                `dotnet wasm-tools workload provisioning failed: ${messageOf(error)}`,
            );
        }
    }
    async provisionTeaVmToolchain(): Promise<void> {
        if (await this.isToolchainPresent(TEAVM_DIRECTORY)) {
            this.scopedLogger.logInformation("TeaVM already provisioned, skipping.");
            return;
        }
        await this.fileSystemOperations.ensureDirectoryExists(TEAVM_DIRECTORY);
        this.scopedLogger.logWarning(
            "TeaVM builds run through ./.tools/maven/ and ./.tools/jdk/; ./.tools/teavm/ only marks provisioning and the teavm-maven-plugin is resolved from Maven Central at build time.",
        );
    }
    async provisionOcamlWasmToolchain(): Promise<void> {
        if (await this.isToolchainPresent(OCAML_COMPILER_PATH)) {
            this.scopedLogger.logInformation("OCaml WASM already provisioned, skipping.");
            return;
        }
        await this.fileSystemOperations.ensureDirectoryExists(OCAML_DIRECTORY);
        this.scopedLogger.logWarning(
            "OCaml has no official prebuilt wasm toolchain. Build one with opam and place bin/ocamlopt under ./.tools/ocaml-wasm/.",
        );
    }
    async provisionGhcWasmToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "GHC WASM",
            archiveUrl: GHC_WASM_GMP_BINDIST_URL,
            archiveFileName: "wasm32-wasi-ghc-gmp.tar.xz",
            targetDirectory: GHC_WASM_DIRECTORY,
            probePath: GHC_WASM_COMPILER_PATH,
            supportedPlatforms: ["linux", "darwin"],
        });
    }
    async provisionAllToolchains(): Promise<void> {
        await this.provisionEmscriptenSdk();
        await this.provisionGoToolchain();
        await this.provisionZigToolchain();
        await this.provisionWasmPackToolchain();
        await this.provisionRustToolchain();
        await this.provisionJdkToolchain();
        await this.provisionMavenToolchain();
        await this.provisionChromeForTesting();
        await this.provisionSwiftWasmToolchain();
        await this.provisionKotlinWasmToolchain();
        await this.provisionDartSdk();
        await this.provisionDotNetSdk();
        await this.provisionTeaVmToolchain();
        await this.provisionOcamlWasmToolchain();
        await this.provisionGhcWasmToolchain();
    }
    private async installArchiveToolchain(spec: ArchiveToolchainSpec): Promise<void> {
        if (await this.isToolchainPresent(spec.probePath)) {
            await this.ensureProbeAlias(spec.probePath);
            this.scopedLogger.logInformation(
                `${spec.toolchainName} already provisioned, skipping.`,
            );
            return;
        }
        if (spec.supportedPlatforms && !spec.supportedPlatforms.includes(this.platformName)) {
            this.scopedLogger.logWarning(
                `${spec.toolchainName} automatic provisioning is available for ${spec.supportedPlatforms.join(", ")} only; provision ${spec.targetDirectory} manually.`,
            );
            return;
        }
        try {
            this.scopedLogger.logInformation(
                `Downloading ${spec.toolchainName} from ${spec.archiveUrl}.`,
            );
            await this.installArchiveContentsInto(
                spec.archiveUrl,
                spec.archiveFileName,
                spec.targetDirectory,
            );
            await this.ensureProbeAlias(spec.probePath);
            this.scopedLogger.logSuccess(
                `${spec.toolchainName} provisioned at ${spec.targetDirectory}.`,
            );
        } catch (error) {
            this.scopedLogger.logWarning(
                `${spec.toolchainName} provisioning failed: ${messageOf(error)}`,
            );
        }
    }
    private async installArchiveContentsInto(
        archiveUrl: string,
        archiveFileName: string,
        targetDirectory: string,
    ): Promise<void> {
        const stagingDirectory = `${targetDirectory}-staging`;
        try {
            await this.fileSystemOperations.removeRecursively(stagingDirectory);
            const archiveContent = await this.fetchArchiveContent(archiveUrl);
            const extractionDirectory = `${stagingDirectory}/extracted`;
            await this.fileSystemOperations.ensureDirectoryExists(extractionDirectory);
            if (archiveFileName.endsWith(".zip")) {
                await this.extractZipInto(archiveContent, extractionDirectory);
            } else {
                const archivePath = `${stagingDirectory}/${archiveFileName}`;
                await this.fileSystemOperations.writeBinaryFile(archivePath, archiveContent);
                await this.extractTarInto(archivePath, extractionDirectory);
            }
            await this.replaceDirectoryWithExtractedContents(extractionDirectory, targetDirectory);
        } finally {
            try {
                await this.fileSystemOperations.removeRecursively(stagingDirectory);
            } catch {}
        }
    }
    private async fetchArchiveContent(sourceUrl: string): Promise<Uint8Array> {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
            throw new Error(`download from ${sourceUrl} failed with HTTP ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
    }
    private async extractZipInto(
        archiveContent: Uint8Array,
        destinationDirectory: string,
    ): Promise<void> {
        const archiveEntries = unzipSync(archiveContent);
        for (const [entryName, entryContent] of Object.entries(archiveEntries)) {
            if (entryName.endsWith("/")) {
                continue;
            }
            await this.fileSystemOperations.writeBinaryFile(
                `${destinationDirectory}/${entryName}`,
                entryContent,
            );
        }
    }
    private async extractTarInto(archivePath: string, destinationDirectory: string): Promise<void> {
        const outcome = await this.processRunner.runToCompletion([
            "tar",
            "-xf",
            archivePath,
            "-C",
            destinationDirectory,
        ]);
        if (outcome.exitCode !== 0) {
            throw new Error(`archive extraction failed: ${outcome.standardError.trim()}`);
        }
    }
    private async replaceDirectoryWithExtractedContents(
        extractionDirectory: string,
        targetDirectory: string,
    ): Promise<void> {
        const extractedFiles =
            await this.fileSystemOperations.listFilesRecursively(extractionDirectory);
        if (extractedFiles.length === 0) {
            throw new Error(`archive extraction produced no files in ${extractionDirectory}`);
        }
        const topLevelNames = [
            ...new Set(extractedFiles.map((filePath) => filePath.split("/")[0])),
        ];
        await this.fileSystemOperations.removeRecursively(targetDirectory);
        if (topLevelNames.length === 1) {
            await this.fileSystemOperations.moveInto(
                `${extractionDirectory}/${topLevelNames[0]}`,
                targetDirectory,
            );
            return;
        }
        await this.fileSystemOperations.ensureDirectoryExists(targetDirectory);
        for (const topLevelName of topLevelNames) {
            await this.fileSystemOperations.moveInto(
                `${extractionDirectory}/${topLevelName}`,
                `${targetDirectory}/${topLevelName}`,
            );
        }
    }
    private async isToolchainPresent(probePath: string): Promise<boolean> {
        if (await this.fileSystemOperations.pathExists(probePath)) {
            return true;
        }
        if (this.platformName !== "win32") {
            return false;
        }
        for (const extension of WINDOWS_EXECUTABLE_EXTENSIONS) {
            if (await this.fileSystemOperations.pathExists(`${probePath}${extension}`)) {
                return true;
            }
        }
        return false;
    }
    private async ensureProbeAlias(probePath: string): Promise<void> {
        if (this.platformName !== "win32") {
            return;
        }
        if (await this.fileSystemOperations.pathExists(probePath)) {
            return;
        }
        for (const extension of WINDOWS_EXECUTABLE_EXTENSIONS) {
            const executablePath = `${probePath}${extension}`;
            if (await this.fileSystemOperations.pathExists(executablePath)) {
                await this.fileSystemOperations.copyFileInto(executablePath, probePath);
                return;
            }
        }
    }
    private async resolvePresentBinaryPath(probePath: string): Promise<string | undefined> {
        if (await this.fileSystemOperations.pathExists(probePath)) {
            return probePath;
        }
        if (this.platformName !== "win32") {
            return undefined;
        }
        for (const extension of WINDOWS_EXECUTABLE_EXTENSIONS) {
            const executablePath = `${probePath}${extension}`;
            if (await this.fileSystemOperations.pathExists(executablePath)) {
                return executablePath;
            }
        }
        return undefined;
    }
}
export { LocalToolchainProvisioner };
