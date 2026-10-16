import { gunzipSync, unzipSync } from "fflate";
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
const SML_DIRECTORY = "./.tools/sml";
const SML_TO_JS_COMPILER_PATH = `${SML_DIRECTORY}/bin/smltojs`;
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
const JSCL_VERSION = "0.9.0-alpha.0";
const JSCL_DIRECTORY = "./.tools/jscl";
const JSCL_FILE_PATH = `${JSCL_DIRECTORY}/jscl.js`;
const JSCL_ARCHIVE_URL = `https://registry.npmjs.org/jscl/-/jscl-${JSCL_VERSION}.tgz`;
const WACL_ARCHIVE_URL = "https://ecky-l.github.io/wacl/releases/wacl.zip";
const WACL_DIRECTORY = "./.tools/tcl";
const WACL_SCRIPT_PATH = `${WACL_DIRECTORY}/wacl.js`;
const WACL_RUNTIME_FILE_NAMES: ReadonlyArray<string> = [
    "wacl.js",
    "wacl.wasm",
    "wacl-library.data",
    "wacl-custom.data",
];
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
const WASI_SH_VERSION = "0.11.0";
const WASI_SH_DIRECTORY = "./.tools/wasi-sh";
const WASI_SH_BUSYBOX_PATH = `${WASI_SH_DIRECTORY}/dist/busybox.wasm`;
const WASI_SH_ARCHIVE_URL = `https://registry.npmjs.org/wasi-sh/-/wasi-sh-${WASI_SH_VERSION}.tgz`;
const JQ_WASM_RELEASE_BASE_URL = "https://github.com/paolosimone/jq-wasm/releases/download/v0.2.3";
const JQ_WASM_DIRECTORY = "./.tools/jq-wasm";
const JQ_WASM_BINARY_PATH = `${JQ_WASM_DIRECTORY}/jq.wasm`;
const JQ_WASM_BINARY_URL = `${JQ_WASM_RELEASE_BASE_URL}/jq.wasm`;
const JQ_WASM_GLUE_FILE_NAME = "jq-runtime.mjs";
const JQ_WASM_GLUE_URL = `${JQ_WASM_RELEASE_BASE_URL}/jq.wasm.mjs`;
const NGN_APL_COMMIT = "f48272b0eb15d98b9d2907bed9bfbee2c45638c1";
const NGN_APL_DIRECTORY = "./.tools/ngn-apl";
const NGN_APL_RUNTIME_PATH = `${NGN_APL_DIRECTORY}/apl.js`;
const NGN_APL_RUNTIME_URL = `https://raw.githubusercontent.com/abrudz/ngn-apl/${NGN_APL_COMMIT}/apl.js`;
const SCALA_CLI_VERSION = "1.18.0";
const SCALA_CLI_DIRECTORY = "./.tools/scala-cli";
const SCALA_CLI_BINARY_PATH = `${SCALA_CLI_DIRECTORY}/scala-cli`;
const SCALA_CLI_HOME_DIRECTORY = "./.tools/scala-cli-home";
const SCALA_CLI_WINDOWS_X64_ARCHIVE_URL = `https://github.com/VirtusLab/scala-cli/releases/download/v${SCALA_CLI_VERSION}/scala-cli-x86_64-pc-win32.zip`;
const ELM_VERSION = "0.19.3";
const ELM_DIRECTORY = "./.tools/elm";
const ELM_BINARY_PATH = `${ELM_DIRECTORY}/elm`;
const ELM_WINDOWS_X64_BINARY_URL = `https://github.com/elm/compiler/releases/download/${ELM_VERSION}/elm-${ELM_VERSION}-windows-x64.gz`;
const GLEAM_VERSION = "1.19.2";
const GLEAM_DIRECTORY = "./.tools/gleam";
const GLEAM_BINARY_PATH = `${GLEAM_DIRECTORY}/gleam`;
const GLEAM_WINDOWS_X64_ARCHIVE_URL = `https://github.com/gleam-lang/gleam/releases/download/v${GLEAM_VERSION}/gleam-v${GLEAM_VERSION}-x86_64-pc-windows-msvc.zip`;
const PURESCRIPT_VERSION = "0.15.16";
const PURESCRIPT_DIRECTORY = "./.tools/purescript";
const PURESCRIPT_BINARY_PATH = `${PURESCRIPT_DIRECTORY}/purs`;
const PURESCRIPT_WINDOWS_X64_ARCHIVE_URL = `https://github.com/purescript/purescript/releases/download/v${PURESCRIPT_VERSION}/win64.tar.gz`;
const PURESCRIPT_LIBRARIES_DIRECTORY = "./.tools/purescript-libraries";
const PURESCRIPT_PRELUDE_VERSION = "6.0.2";
const PURESCRIPT_EFFECT_VERSION = "4.0.0";
const HAXE_VERSION = "4.3.7";
const HAXE_DIRECTORY = "./.tools/haxe";
const HAXE_BINARY_PATH = `${HAXE_DIRECTORY}/haxe`;
const HAXE_WINDOWS_X64_ARCHIVE_URL = `https://github.com/HaxeFoundation/haxe/releases/download/${HAXE_VERSION}/haxe-${HAXE_VERSION}-win64.zip`;
const RESCRIPT_VERSION = "12.3.1";
const RESCRIPT_DIRECTORY = "./.tools/js-toolchains/node_modules/rescript";
const RESCRIPT_BINARY_PATH = `${RESCRIPT_DIRECTORY}/cli/rescript.js`;
const RESCRIPT_NPM_PACKAGES: ReadonlyArray<[string, string]> = [
    ["rescript", RESCRIPT_VERSION],
    ["@rescript/win32-x64", RESCRIPT_VERSION],
    ["@rescript/runtime", RESCRIPT_VERSION],
];
const FABLE_VERSION = "5.21.0";
const FABLE_DIRECTORY = "./.tools/dotnet-tools";
const FABLE_BINARY_PATH = `${FABLE_DIRECTORY}/fable`;
const FABLE_NUGET_PACKAGES_DIRECTORY = "./.tools/fable-nuget-packages";
const DOTNET_CLI_HOME_DIRECTORY = "./.tools/dotnet-cli-home";
const NUGET_PACKAGES_DIRECTORY = "./.tools/nuget-packages";
const ZEROPERL_COMMIT = "25d7100492c9437af1c928b3686b1a1d837580be";
const ZEROPERL_DIRECTORY = "./.tools/webperl";
const ZEROPERL_LOADER_FILE_PATH = `${ZEROPERL_DIRECTORY}/perl-runtime.js`;
const ZEROPERL_WASM_FILE_PATH = `${ZEROPERL_DIRECTORY}/zeroperl.wasm`;
const ZEROPERL_LOADER_URL = `https://raw.githubusercontent.com/manwar/perl-wasm/${ZEROPERL_COMMIT}/v5.44/dist/esm/index.js`;
const ZEROPERL_WASM_URL = `https://raw.githubusercontent.com/manwar/perl-wasm/${ZEROPERL_COMMIT}/v5.44/zeroperl.wasm`;
const FPC_WASM_DIRECTORY = "./.tools/fpc";
const FPC_WASM_ARCHIVE_URL =
    "https://downloads.freepascal.org/fpc/snapshot/v33/wasm32-wasip1/fpc-3.3.1.wasm32-wasip1.built.on.x86_64-linux.tar.gz";
const FPC_WASM_WIN64_COMPILER_PATH = `${FPC_WASM_DIRECTORY}/bin/x86_64-win64/ppcrosswasm32`;
const FPC_WASM_LINUX_COMPILER_PATH = `${FPC_WASM_DIRECTORY}/bin/x86_64-linux/ppcrosswasm32`;
const FPC_WASM_DARWIN_COMPILER_PATH = `${FPC_WASM_DIRECTORY}/bin/x86_64-darwin/ppcrosswasm32`;
const GNUCOBOL_DIRECTORY = "./.tools/gnucobol";
const GNUCOBOL_TRANSLATOR_PATH = `${GNUCOBOL_DIRECTORY}/bin/cobc`;
const GNUCOBOL_BINARIES_ARCHIVE_URL =
    "https://github.com/mridoni/gnucobol-binaries/releases/download/3.1.2-20230124/gnucobol-3.1.2-windows-msvc-all.7z";
const GNUCOBOL_SOURCES_ARCHIVE_URL =
    "https://downloads.sourceforge.net/project/gnucobol/gnucobol/3.2/gnucobol-3.2_win.zip";
const LFORTRAN_DIRECTORY = "./.tools/lfortran";
const LFORTRAN_BINARY_PATH = `${LFORTRAN_DIRECTORY}/bin/lfortran`;
const LFORTRAN_CONDA_PACKAGE_URLS: ReadonlyArray<string> = [
    "https://conda.anaconda.org/conda-forge/win-64/lfortran-0.67.0-hc50d9fe_0.conda",
    "https://conda.anaconda.org/conda-forge/win-64/xeus-6.0.6-h477610d_0.conda",
    "https://conda.anaconda.org/conda-forge/win-64/xeus-zmq-4.0.1-hecdc818_0.conda",
    "https://conda.anaconda.org/conda-forge/win-64/zeromq-4.3.5-drafts_h37f6b46_9.conda",
    "https://conda.anaconda.org/conda-forge/win-64/libsodium-1.0.22-h6a83c73_0.conda",
    "https://conda.anaconda.org/conda-forge/win-64/cppzmq-4.11.0-h0000e93_0.conda",
    "https://conda.anaconda.org/conda-forge/win-64/libzlib-1.3.2-hfd05255_2.conda",
    "https://conda.anaconda.org/conda-forge/win-64/zstd-1.5.7-h1b5488d_4.conda",
];
const VERILOG_WASM_DIRECTORY = "./.tools/verilog";
const VERILOG_WASM_COMMIT = "a275a9ac28c59db1130505973644c9a3754ec1d7";
const VERILOG_WASM_BASE_URL = `https://raw.githubusercontent.com/senolgulgonul/verisim/${VERILOG_WASM_COMMIT}`;
const VERILOG_WASM_FILE_NAMES: ReadonlyArray<string> = [
    "ivlpp.js",
    "ivlpp.wasm",
    "ivl.js",
    "ivl.wasm",
    "vvp.js",
    "vvp.wasm",
];
const VIM_WASM_VERSION = "0.0.13";
const VIM_WASM_DIRECTORY = "./.tools/vim-wasm";
const VIM_WASM_BINARY_PATH = `${VIM_WASM_DIRECTORY}/vim.wasm`;
const VIM_WASM_ARCHIVE_URL = `https://registry.npmjs.org/vim-wasm/-/vim-wasm-${VIM_WASM_VERSION}.tgz`;
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
function dotNetEnvironmentOverrides(): Record<string, string> {
    return {
        DOTNET_ROOT: resolve(process.cwd(), DOTNET_DIRECTORY),
        DOTNET_CLI_HOME: resolve(process.cwd(), DOTNET_CLI_HOME_DIRECTORY),
        NUGET_PACKAGES: resolve(process.cwd(), NUGET_PACKAGES_DIRECTORY),
    };
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
    async provisionSmlToolchain(): Promise<void> {
        if (await this.isToolchainPresent(SML_TO_JS_COMPILER_PATH)) {
            this.scopedLogger.logInformation("SMLtoJs already provisioned, skipping.");
            return;
        }
        await this.fileSystemOperations.ensureDirectoryExists(SML_DIRECTORY);
        this.scopedLogger.logWarning(
            "Standard ML has no pinned browser toolchain: MLKit releases ship linux/darwin binaries only (no wasm32 and no win32 asset), SMLtoJs needs a host MLKit or MLton build, and the sml.js npm package is an unrelated UI library. Provision ./.tools/sml/bin/smltojs manually; until then Standard ML builds report Run pnpm run setup.",
        );
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
    async provisionJsclRuntime(): Promise<void> {
        if (await this.isToolchainPresent(JSCL_FILE_PATH)) {
            this.scopedLogger.logInformation("JSCL runtime already provisioned, skipping.");
            return;
        }
        const stagingDirectory = `${JSCL_DIRECTORY}-staging`;
        try {
            this.scopedLogger.logInformation(`Downloading JSCL from ${JSCL_ARCHIVE_URL}.`);
            const archivePath = `${stagingDirectory}/jscl-${JSCL_VERSION}.tgz`;
            await this.fileSystemOperations.ensureDirectoryExists(stagingDirectory);
            await this.fileSystemOperations.writeBinaryFile(
                archivePath,
                await this.fetchArchiveContent(JSCL_ARCHIVE_URL),
            );
            const extractionDirectory = `${stagingDirectory}/extracted`;
            await this.fileSystemOperations.ensureDirectoryExists(extractionDirectory);
            await this.extractTarInto(archivePath, extractionDirectory);
            await this.fileSystemOperations.copyFileInto(
                `${extractionDirectory}/package/dist/jscl.js`,
                JSCL_FILE_PATH,
            );
            this.scopedLogger.logSuccess(`JSCL runtime provisioned at ${JSCL_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`JSCL runtime provisioning failed: ${messageOf(error)}`);
        } finally {
            try {
                await this.fileSystemOperations.removeRecursively(stagingDirectory);
            } catch {}
        }
    }
    async provisionWaclRuntime(): Promise<void> {
        if (await this.isToolchainPresent(WACL_SCRIPT_PATH)) {
            this.scopedLogger.logInformation("Tcl wacl runtime already provisioned, skipping.");
            return;
        }
        const stagingDirectory = `${WACL_DIRECTORY}-staging`;
        try {
            this.scopedLogger.logInformation(
                `Downloading Tcl wacl runtime from ${WACL_ARCHIVE_URL}.`,
            );
            const archiveContent = await this.fetchArchiveContent(WACL_ARCHIVE_URL);
            const extractionDirectory = `${stagingDirectory}/extracted`;
            await this.fileSystemOperations.ensureDirectoryExists(extractionDirectory);
            await this.extractZipInto(archiveContent, extractionDirectory);
            for (const fileName of WACL_RUNTIME_FILE_NAMES) {
                await this.fileSystemOperations.copyFileInto(
                    `${extractionDirectory}/js/tcl/${fileName}`,
                    `${WACL_DIRECTORY}/${fileName}`,
                );
            }
            this.scopedLogger.logSuccess(`Tcl wacl runtime provisioned at ${WACL_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(
                `Tcl wacl runtime provisioning failed: ${messageOf(error)}`,
            );
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
    async provisionWasiShellRuntime(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "wasi-sh busybox shell",
            archiveUrl: WASI_SH_ARCHIVE_URL,
            archiveFileName: `wasi-sh-${WASI_SH_VERSION}.tgz`,
            targetDirectory: WASI_SH_DIRECTORY,
            probePath: WASI_SH_BUSYBOX_PATH,
        });
    }
    async provisionScalaCli(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Scala CLI",
            archiveUrl: SCALA_CLI_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `scala-cli-${SCALA_CLI_VERSION}-win32.zip`,
            targetDirectory: SCALA_CLI_DIRECTORY,
            probePath: SCALA_CLI_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
        if (!(await this.isToolchainPresent(SCALA_CLI_BINARY_PATH))) {
            return;
        }
        try {
            await this.fileSystemOperations.ensureDirectoryExists(SCALA_CLI_HOME_DIRECTORY);
            this.scopedLogger.logInformation(
                "Scala.js dependencies are resolved into ./.tools/scala-cli-home on first compilation.",
            );
        } catch (error) {
            this.scopedLogger.logWarning(`Scala CLI warm-up failed: ${messageOf(error)}`);
        }
    }
    async provisionElmToolchain(): Promise<void> {
        if (await this.isToolchainPresent(ELM_BINARY_PATH)) {
            this.scopedLogger.logInformation("Elm already provisioned, skipping.");
            return;
        }
        if (this.platformName !== "win32") {
            this.scopedLogger.logWarning(
                "Elm automatic provisioning is available for win32 only; provision ./.tools/elm/elm manually.",
            );
            return;
        }
        try {
            this.scopedLogger.logInformation(`Downloading Elm from ${ELM_WINDOWS_X64_BINARY_URL}.`);
            const compressedBytes = await this.fetchArchiveContent(ELM_WINDOWS_X64_BINARY_URL);
            await this.fileSystemOperations.writeBinaryFile(
                ELM_BINARY_PATH,
                gunzipSync(compressedBytes),
            );
            this.scopedLogger.logSuccess(`Elm provisioned at ${ELM_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`Elm provisioning failed: ${messageOf(error)}`);
        }
    }
    async provisionGleamToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Gleam",
            archiveUrl: GLEAM_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `gleam-v${GLEAM_VERSION}-windows.zip`,
            targetDirectory: GLEAM_DIRECTORY,
            probePath: GLEAM_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionPureScriptToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "PureScript",
            archiveUrl: PURESCRIPT_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `purescript-v${PURESCRIPT_VERSION}-win64.tar.gz`,
            targetDirectory: PURESCRIPT_DIRECTORY,
            probePath: PURESCRIPT_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
        if (!(await this.isToolchainPresent(PURESCRIPT_BINARY_PATH))) {
            return;
        }
        await this.installPureScriptLibrary("purescript-prelude", `v${PURESCRIPT_PRELUDE_VERSION}`);
        await this.installPureScriptLibrary("purescript-effect", `v${PURESCRIPT_EFFECT_VERSION}`);
    }
    async provisionHaxeToolchain(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "Haxe",
            archiveUrl: HAXE_WINDOWS_X64_ARCHIVE_URL,
            archiveFileName: `haxe-${HAXE_VERSION}-win64.zip`,
            targetDirectory: HAXE_DIRECTORY,
            probePath: HAXE_BINARY_PATH,
            supportedPlatforms: ["win32"],
        });
    }
    async provisionReScriptToolchain(): Promise<void> {
        if (await this.fileSystemOperations.pathExists(RESCRIPT_BINARY_PATH)) {
            this.scopedLogger.logInformation("ReScript already provisioned, skipping.");
            return;
        }
        if (this.platformName !== "win32") {
            this.scopedLogger.logWarning(
                "ReScript automatic provisioning is available for win32 only; provision ./.tools/js-toolchains/node_modules/rescript manually.",
            );
            return;
        }
        try {
            for (const [packageName, packageVersion] of RESCRIPT_NPM_PACKAGES) {
                await this.installNpmPackage(packageName, packageVersion);
            }
            this.scopedLogger.logSuccess(`ReScript provisioned at ${RESCRIPT_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`ReScript provisioning failed: ${messageOf(error)}`);
        }
    }
    async provisionFableToolchain(): Promise<void> {
        if (await this.fileSystemOperations.pathExists(FABLE_BINARY_PATH)) {
            this.scopedLogger.logInformation("Fable already provisioned, skipping.");
            return;
        }
        if (this.platformName !== "win32") {
            this.scopedLogger.logWarning(
                "Fable automatic provisioning is available for win32 only; run dotnet tool install fable --tool-path ./.tools/dotnet-tools manually.",
            );
            return;
        }
        const dotNetBinaryPath = await this.resolvePresentBinaryPath(DOTNET_BINARY_PATH);
        if (!dotNetBinaryPath) {
            this.scopedLogger.logWarning(
                "dotnet SDK is missing; run pnpm run setup to provision ./.tools/dotnet/ before Fable.",
            );
            return;
        }
        try {
            const outcome = await this.processRunner.runToCompletion(
                [
                    dotNetBinaryPath,
                    "tool",
                    "install",
                    "fable",
                    "--version",
                    FABLE_VERSION,
                    "--tool-path",
                    FABLE_DIRECTORY,
                ],
                { environmentOverrides: dotNetEnvironmentOverrides() },
            );
            if (outcome.exitCode !== 0) {
                this.scopedLogger.logWarning(
                    `Fable install failed: ${outcome.standardError.trim() || outcome.standardOutput.trim()}`,
                );
                return;
            }
            await this.ensureProbeAlias(FABLE_BINARY_PATH);
            this.scopedLogger.logSuccess(`Fable provisioned at ${FABLE_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`Fable provisioning failed: ${messageOf(error)}`);
        }
    }
    async provisionWebPerlRuntime(): Promise<void> {
        if (
            (await this.isToolchainPresent(ZEROPERL_LOADER_FILE_PATH)) &&
            (await this.isToolchainPresent(ZEROPERL_WASM_FILE_PATH))
        ) {
            this.scopedLogger.logInformation("WebPerl runtime already provisioned, skipping.");
            return;
        }
        try {
            this.scopedLogger.logInformation(
                `Downloading WebPerl runtime from ${ZEROPERL_WASM_URL}.`,
            );
            await this.fileSystemOperations.writeBinaryFile(
                ZEROPERL_WASM_FILE_PATH,
                await this.fetchArchiveContent(ZEROPERL_WASM_URL),
            );
            await this.fileSystemOperations.writeTextFile(
                ZEROPERL_LOADER_FILE_PATH,
                await this.fetchTextContent(ZEROPERL_LOADER_URL),
            );
            this.scopedLogger.logSuccess(`WebPerl runtime provisioned at ${ZEROPERL_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(
                `WebPerl runtime provisioning failed: ${messageOf(error)}`,
            );
        }
    }
    async provisionFpcWasmToolchain(): Promise<void> {
        if (await this.isToolchainPresent(FPC_WASM_LINUX_COMPILER_PATH)) {
            this.scopedLogger.logInformation("Free Pascal WASM already provisioned, skipping.");
            return;
        }
        if (await this.isToolchainPresent(FPC_WASM_WIN64_COMPILER_PATH)) {
            this.scopedLogger.logInformation("Free Pascal WASM already provisioned, skipping.");
            return;
        }
        if (this.platformName === "win32") {
            await this.fileSystemOperations.ensureDirectoryExists(FPC_WASM_DIRECTORY);
            this.scopedLogger.logWarning(
                "Free Pascal ships no prebuilt win32-host wasm cross compiler: the official snapshot at downloads.freepascal.org/fpc/snapshot/v33/wasm32-wasip1/ contains only an x86_64-linux build, and the 3.2.2 Windows release has no wasm target. Provision ./.tools/fpc/bin/x86_64-win64/ppcrosswasm32.exe manually with fpcupdeluxe or `make crossall OS_TARGET=wasip1 CPU_TARGET=wasm32 PP=fpc`.",
            );
            return;
        }
        if (this.platformName !== "linux") {
            await this.fileSystemOperations.ensureDirectoryExists(FPC_WASM_DIRECTORY);
            this.scopedLogger.logWarning(
                "The official Free Pascal WASM snapshot is an x86_64-linux build; provision ./.tools/fpc/bin/ppcrosswasm32 for this platform manually.",
            );
            return;
        }
        await this.installArchiveToolchain({
            toolchainName: "Free Pascal WASM",
            archiveUrl: FPC_WASM_ARCHIVE_URL,
            archiveFileName: "fpc-3.3.1.wasm32-wasip1.built.on.x86_64-linux.tar.gz",
            targetDirectory: FPC_WASM_DIRECTORY,
            probePath: FPC_WASM_LINUX_COMPILER_PATH,
            supportedPlatforms: ["linux"],
        });
    }
    async provisionGnuCobolToolchain(): Promise<void> {
        if (await this.isToolchainPresent(GNUCOBOL_TRANSLATOR_PATH)) {
            this.scopedLogger.logInformation("GnuCOBOL already provisioned, skipping.");
            return;
        }
        if (this.platformName !== "win32") {
            await this.fileSystemOperations.ensureDirectoryExists(GNUCOBOL_DIRECTORY);
            this.scopedLogger.logWarning(
                "GnuCOBOL prebuilt binaries are published for Windows only; provision ./.tools/gnucobol/bin/cobc manually on this platform.",
            );
            return;
        }
        try {
            this.scopedLogger.logInformation(
                `Downloading GnuCOBOL from ${GNUCOBOL_BINARIES_ARCHIVE_URL}.`,
            );
            await this.installArchiveContentsInto(
                GNUCOBOL_BINARIES_ARCHIVE_URL,
                "gnucobol-3.1.2-windows-msvc-all.7z",
                GNUCOBOL_DIRECTORY,
            );
            await this.ensureProbeAlias(GNUCOBOL_TRANSLATOR_PATH);
            this.scopedLogger.logSuccess(`GnuCOBOL provisioned at ${GNUCOBOL_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`GnuCOBOL provisioning failed: ${messageOf(error)}`);
        }
        try {
            if (!(await this.fileSystemOperations.pathExists(`${GNUCOBOL_DIRECTORY}/sources`))) {
                this.scopedLogger.logInformation(
                    `Downloading GnuCOBOL sources from ${GNUCOBOL_SOURCES_ARCHIVE_URL}.`,
                );
                await this.installArchiveContentsInto(
                    GNUCOBOL_SOURCES_ARCHIVE_URL,
                    "gnucobol-3.2_win.zip",
                    `${GNUCOBOL_DIRECTORY}/sources`,
                );
            }
        } catch (error) {
            this.scopedLogger.logWarning(
                `GnuCOBOL source provisioning failed: ${messageOf(error)}`,
            );
        }
        if (!(await this.fileSystemOperations.pathExists(`${GNUCOBOL_DIRECTORY}/wasm/libcob.a`))) {
            this.scopedLogger.logWarning(
                "GnuCOBOL wasm runtime library ./.tools/gnucobol/wasm/libcob.a is not present. GnuCOBOL ships no wasm build of libcob, and libcob requires GMP (or MPIR) compiled to wasm; build both with ./.emsdk/ to enable wasm builds.",
            );
        }
    }
    async provisionLFortranToolchain(): Promise<void> {
        if (await this.isToolchainPresent(LFORTRAN_BINARY_PATH)) {
            this.scopedLogger.logInformation("LFortran already provisioned, skipping.");
            return;
        }
        if (this.platformName !== "win32") {
            await this.fileSystemOperations.ensureDirectoryExists(LFORTRAN_DIRECTORY);
            this.scopedLogger.logWarning(
                "LFortran prebuilt binaries are published only as conda-forge win-64 packages; provision ./.tools/lfortran/ manually on this platform.",
            );
            return;
        }
        try {
            for (const packageUrl of LFORTRAN_CONDA_PACKAGE_URLS) {
                await this.extractCondaPackageInto(packageUrl, `${LFORTRAN_DIRECTORY}/bin`);
            }
            this.scopedLogger.logSuccess(`LFortran provisioned at ${LFORTRAN_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`LFortran provisioning failed: ${messageOf(error)}`);
        } finally {
            try {
                await this.fileSystemOperations.removeRecursively(`${LFORTRAN_DIRECTORY}-staging`);
            } catch {}
        }
    }
    private async extractCondaPackageInto(
        packageUrl: string,
        destinationDirectory: string,
    ): Promise<void> {
        const archiveFileName = packageUrl.split("/").pop() as string;
        const stagingDirectory = `${LFORTRAN_DIRECTORY}-staging/${archiveFileName}`;
        this.scopedLogger.logInformation(`Downloading ${archiveFileName}.`);
        const archivePath = `${stagingDirectory}/${archiveFileName}`;
        await this.fileSystemOperations.writeBinaryFile(
            archivePath,
            await this.fetchArchiveContent(packageUrl),
        );
        await this.extractTarInto(archivePath, stagingDirectory);
        const stagedFiles = await this.fileSystemOperations.listFilesRecursively(stagingDirectory);
        const packagePayloadPath = stagedFiles.find(
            (relativePath) => relativePath.startsWith("pkg-") && relativePath.endsWith(".tar.zst"),
        );
        if (!packagePayloadPath) {
            throw new Error(`${archiveFileName} does not contain a package payload`);
        }
        const extractionDirectory = `${stagingDirectory}/extracted`;
        await this.fileSystemOperations.ensureDirectoryExists(extractionDirectory);
        await this.extractTarInto(`${stagingDirectory}/${packagePayloadPath}`, extractionDirectory);
        const libraryBinDirectory = `${extractionDirectory}/Library/bin`;
        if (!(await this.fileSystemOperations.pathExists(libraryBinDirectory))) {
            return;
        }
        const libraryBinFiles =
            await this.fileSystemOperations.listFilesRecursively(libraryBinDirectory);
        for (const relativePath of libraryBinFiles) {
            const fileName = relativePath.split("/").pop() as string;
            await this.fileSystemOperations.copyFileInto(
                `${libraryBinDirectory}/${relativePath}`,
                `${destinationDirectory}/${fileName}`,
            );
        }
    }
    private async installNpmPackage(packageName: string, packageVersion: string): Promise<void> {
        const tarballFileName = packageName.split("/").pop() as string;
        const sourceUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/-/${tarballFileName}-${packageVersion}.tgz`;
        const targetDirectory = `./.tools/js-toolchains/node_modules/${packageName}`;
        const stagingDirectory = `${targetDirectory}-staging`;
        try {
            await this.fileSystemOperations.removeRecursively(stagingDirectory);
            this.scopedLogger.logInformation(`Downloading ${packageName} from ${sourceUrl}.`);
            const archiveContent = await this.fetchArchiveContent(sourceUrl);
            const archivePath = `${stagingDirectory}/${tarballFileName}.tgz`;
            await this.fileSystemOperations.writeBinaryFile(archivePath, archiveContent);
            const extractionDirectory = `${stagingDirectory}/extracted`;
            await this.fileSystemOperations.ensureDirectoryExists(extractionDirectory);
            await this.extractTarInto(archivePath, extractionDirectory);
            await this.fileSystemOperations.removeRecursively(targetDirectory);
            await this.fileSystemOperations.moveInto(
                `${extractionDirectory}/package`,
                targetDirectory,
            );
        } finally {
            try {
                await this.fileSystemOperations.removeRecursively(stagingDirectory);
            } catch {}
        }
    }
    private async installPureScriptLibrary(
        libraryName: string,
        libraryVersionTag: string,
    ): Promise<void> {
        const targetDirectory = `${PURESCRIPT_LIBRARIES_DIRECTORY}/${libraryName}`;
        if (await this.fileSystemOperations.pathExists(`${targetDirectory}/src`)) {
            this.scopedLogger.logInformation(`${libraryName} already vendored, skipping.`);
            return;
        }
        const sourceUrl = `https://github.com/purescript/${libraryName}/archive/refs/tags/${libraryVersionTag}.tar.gz`;
        const stagingDirectory = `${PURESCRIPT_LIBRARIES_DIRECTORY}-staging`;
        try {
            this.scopedLogger.logInformation(`Downloading ${libraryName} from ${sourceUrl}.`);
            const archiveContent = await this.fetchArchiveContent(sourceUrl);
            const archivePath = `${stagingDirectory}/${libraryName}.tar.gz`;
            await this.fileSystemOperations.writeBinaryFile(archivePath, archiveContent);
            const extractionDirectory = `${stagingDirectory}/extracted`;
            await this.fileSystemOperations.ensureDirectoryExists(extractionDirectory);
            await this.extractTarInto(archivePath, extractionDirectory);
            const extractedFiles =
                await this.fileSystemOperations.listFilesRecursively(extractionDirectory);
            const topLevelName = extractedFiles[0]?.split("/")[0] as string | undefined;
            if (!topLevelName) {
                throw new Error(`${libraryName} archive extraction produced no files`);
            }
            await this.fileSystemOperations.copyDirectoryInto(
                `${extractionDirectory}/${topLevelName}/src`,
                `${targetDirectory}/src`,
            );
            this.scopedLogger.logSuccess(`${libraryName} vendored at ${targetDirectory}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`${libraryName} provisioning failed: ${messageOf(error)}`);
        } finally {
            try {
                await this.fileSystemOperations.removeRecursively(stagingDirectory);
            } catch {}
        }
    }
    async provisionJqWasmRuntime(): Promise<void> {
        if (await this.isToolchainPresent(JQ_WASM_BINARY_PATH)) {
            this.scopedLogger.logInformation("jq wasm runtime already provisioned, skipping.");
            return;
        }
        try {
            this.scopedLogger.logInformation(
                `Downloading jq wasm runtime from ${JQ_WASM_BINARY_URL}.`,
            );
            const binaryBytes = await this.fetchArchiveContent(JQ_WASM_BINARY_URL);
            await this.fileSystemOperations.writeBinaryFile(JQ_WASM_BINARY_PATH, binaryBytes);
            await this.fileSystemOperations.writeTextFile(
                `${JQ_WASM_DIRECTORY}/${JQ_WASM_GLUE_FILE_NAME}`,
                await this.fetchTextContent(JQ_WASM_GLUE_URL),
            );
            this.scopedLogger.logSuccess(`jq wasm runtime provisioned at ${JQ_WASM_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(`jq wasm provisioning failed: ${messageOf(error)}`);
        }
    }
    async provisionNgnAplRuntime(): Promise<void> {
        if (await this.isToolchainPresent(NGN_APL_RUNTIME_PATH)) {
            this.scopedLogger.logInformation("ngn/apl runtime already provisioned, skipping.");
            return;
        }
        try {
            this.scopedLogger.logInformation(
                `Downloading ngn/apl runtime from ${NGN_APL_RUNTIME_URL}.`,
            );
            await this.fileSystemOperations.writeTextFile(
                NGN_APL_RUNTIME_PATH,
                await this.fetchTextContent(NGN_APL_RUNTIME_URL),
            );
            this.scopedLogger.logSuccess(`ngn/apl runtime provisioned at ${NGN_APL_DIRECTORY}.`);
        } catch (error) {
            this.scopedLogger.logWarning(
                `ngn/apl runtime provisioning failed: ${messageOf(error)}`,
            );
        }
    }
    private async fetchTextContent(sourceUrl: string): Promise<string> {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
            throw new Error(`download from ${sourceUrl} failed with HTTP ${response.status}`);
        }
        return await response.text();
    }
    async provisionVerilogWasmRuntime(): Promise<void> {
        if (await this.isToolchainPresent(`${VERILOG_WASM_DIRECTORY}/vvp.wasm`)) {
            this.scopedLogger.logInformation("Verilog wasm runtime already provisioned, skipping.");
            return;
        }
        try {
            for (const fileName of VERILOG_WASM_FILE_NAMES) {
                const sourceUrl = `${VERILOG_WASM_BASE_URL}/${fileName}`;
                this.scopedLogger.logInformation(
                    `Downloading Verilog wasm runtime from ${sourceUrl}.`,
                );
                await this.fileSystemOperations.writeBinaryFile(
                    `${VERILOG_WASM_DIRECTORY}/${fileName}`,
                    await this.fetchArchiveContent(sourceUrl),
                );
            }
            this.scopedLogger.logSuccess(
                `Verilog wasm runtime provisioned at ${VERILOG_WASM_DIRECTORY}.`,
            );
        } catch (error) {
            this.scopedLogger.logWarning(`Verilog wasm provisioning failed: ${messageOf(error)}`);
        }
    }
    async provisionVimWasmRuntime(): Promise<void> {
        await this.installArchiveToolchain({
            toolchainName: "vim.wasm",
            archiveUrl: VIM_WASM_ARCHIVE_URL,
            archiveFileName: `vim-wasm-${VIM_WASM_VERSION}.tgz`,
            targetDirectory: VIM_WASM_DIRECTORY,
            probePath: VIM_WASM_BINARY_PATH,
        });
    }
    async provisionAllToolchains(): Promise<void> {
        await this.provisionEmscriptenSdk();
        await this.provisionGoToolchain();
        await this.provisionSmlToolchain();
        await this.provisionZigToolchain();
        await this.provisionWasmPackToolchain();
        await this.provisionRustToolchain();
        await this.provisionJsclRuntime();
        await this.provisionWaclRuntime();
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
        await this.provisionWasiShellRuntime();
        await this.provisionJqWasmRuntime();
        await this.provisionNgnAplRuntime();
        await this.provisionScalaCli();
        await this.provisionElmToolchain();
        await this.provisionGleamToolchain();
        await this.provisionPureScriptToolchain();
        await this.provisionHaxeToolchain();
        await this.provisionReScriptToolchain();
        await this.provisionFableToolchain();
        await this.provisionWebPerlRuntime();
        await this.provisionFpcWasmToolchain();
        await this.provisionGnuCobolToolchain();
        await this.provisionLFortranToolchain();
        await this.provisionVerilogWasmRuntime();
        await this.provisionVimWasmRuntime();
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
