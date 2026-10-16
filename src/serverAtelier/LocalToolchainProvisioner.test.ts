import { describe, expect, test } from "vitest";
import { strToU8, zipSync } from "fflate";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { LocalToolchainProvisioner } from "@serverAtelier/LocalToolchainProvisioner.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import type { ProcessOutcome, ProcessRunOptions } from "@serverAtelier/utilities/ProcessRunner.ts";
class FakeFileSystemOperations {
    private readonly existingPaths = new Set<string>();
    readonly ensuredDirectories: Array<string> = [];
    readonly removedPaths: Array<string> = [];
    readonly movedPairs: Array<[string, string]> = [];
    readonly copiedPairs: Array<[string, string]> = [];
    readonly writtenFiles: Array<string> = [];
    listedFiles: Array<string> = [];
    markExisting(targetPath: string): void {
        this.existingPaths.add(targetPath);
    }
    async ensureDirectoryExists(directoryPath: string): Promise<void> {
        this.ensuredDirectories.push(directoryPath);
        this.existingPaths.add(directoryPath);
    }
    async removeRecursively(targetPath: string): Promise<void> {
        this.removedPaths.push(targetPath);
        for (const existingPath of [...this.existingPaths]) {
            if (existingPath === targetPath || existingPath.startsWith(`${targetPath}/`)) {
                this.existingPaths.delete(existingPath);
            }
        }
    }
    async copyFileInto(sourcePath: string, targetPath: string): Promise<void> {
        this.copiedPairs.push([sourcePath, targetPath]);
        this.existingPaths.add(targetPath);
    }
    async moveInto(sourcePath: string, targetPath: string): Promise<void> {
        this.movedPairs.push([sourcePath, targetPath]);
        this.existingPaths.add(targetPath);
        for (const listedFile of this.listedFiles) {
            const firstSlashIndex = listedFile.indexOf("/");
            const withoutFirstSegment =
                firstSlashIndex === -1 ? listedFile : listedFile.slice(firstSlashIndex + 1);
            if (withoutFirstSegment.length > 0) {
                this.existingPaths.add(`${targetPath}/${withoutFirstSegment}`);
            }
        }
    }
    async pathExists(targetPath: string): Promise<boolean> {
        return this.existingPaths.has(targetPath);
    }
    async listFilesRecursively(): Promise<Array<string>> {
        return this.listedFiles;
    }
    async writeBinaryFile(targetPath: string): Promise<void> {
        this.writtenFiles.push(targetPath);
    }
}
class FakeProcessRunner {
    readonly commandHistory: Array<ReadonlyArray<string>> = [];
    readonly optionsHistory: Array<ProcessRunOptions> = [];
    outcomeForCommand: (command: ReadonlyArray<string>) => ProcessOutcome = () => ({
        exitCode: 0,
        standardOutput: "",
        standardError: "",
    });
    async runToCompletion(
        command: ReadonlyArray<string>,
        options: ProcessRunOptions = {},
    ): Promise<ProcessOutcome> {
        this.commandHistory.push(command);
        this.optionsHistory.push(options);
        return this.outcomeForCommand(command);
    }
}
class FakeScopedLogger {
    readonly informations: Array<string> = [];
    readonly warnings: Array<string> = [];
    readonly successes: Array<string> = [];
    logInformation(message: string): void {
        this.informations.push(message);
    }
    logSuccess(message: string): void {
        this.successes.push(message);
    }
    logWarning(message: string): void {
        this.warnings.push(message);
    }
}
function createHarness(platformName: NodeJS.Platform) {
    const fileSystemOperations = new FakeFileSystemOperations();
    const processRunner = new FakeProcessRunner();
    const scopedLogger = new FakeScopedLogger();
    const provisioner = new LocalToolchainProvisioner(
        fileSystemOperations as unknown as FileSystemOperations,
        processRunner as unknown as ProcessRunner,
        scopedLogger as unknown as ScopedLogger,
        platformName,
    );
    return { fileSystemOperations, processRunner, scopedLogger, provisioner };
}
async function withStubbedFetch<T>(
    stub: (input: unknown) => Promise<Response>,
    run: () => Promise<T>,
): Promise<T> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = stub as unknown as typeof fetch;
    try {
        return await run();
    } finally {
        globalThis.fetch = originalFetch;
    }
}
function responseWithBody(body: Uint8Array): Promise<Response> {
    return Promise.resolve(new Response(new Uint8Array(body)));
}
function zipResponse(entries: Record<string, string>): Promise<Response> {
    const zippedEntries: Record<string, Uint8Array> = {};
    for (const [entryName, entryContent] of Object.entries(entries)) {
        zippedEntries[entryName] = strToU8(entryContent);
    }
    return responseWithBody(zipSync(zippedEntries));
}
function jsonResponse(payload: unknown): Promise<Response> {
    return Promise.resolve(new Response(JSON.stringify(payload)));
}
describe("LocalToolchainProvisioner", () => {
    describe("provisionEmscriptenSdk", () => {
        test("skips when emcc or emcc.bat already exists", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.emsdk/upstream/emscripten/emcc.bat");
            await harness.provisioner.provisionEmscriptenSdk();
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.scopedLogger.informations).toContain(
                "Emscripten SDK already provisioned, skipping.",
            );
        });
        test("downloads the emsdk zip, extracts it, then installs and activates through cmd /c", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = ["emsdk-main/emsdk.bat", "emsdk-main/emsdk"];
            await withStubbedFetch(
                () =>
                    zipResponse({
                        "emsdk-main/emsdk.bat": "@echo off\n",
                        "emsdk-main/emsdk": "#!/bin/sh\n",
                    }),
                () => harness.provisioner.provisionEmscriptenSdk(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.emsdk-staging/extracted/emsdk-main/emsdk.bat",
                "./.emsdk-staging/extracted/emsdk-main/emsdk",
            ]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                ["./.emsdk-staging/extracted/emsdk-main", "./.emsdk"],
            ]);
            expect(harness.processRunner.commandHistory).toEqual([
                ["cmd", "/c", ".\\.emsdk\\emsdk.bat", "install", "latest"],
                ["cmd", "/c", ".\\.emsdk\\emsdk.bat", "activate", "latest"],
            ]);
            expect(harness.scopedLogger.successes).toContain(
                "Emscripten SDK installed and activated.",
            );
        });
        test("installs in place on POSIX without downloading when .emsdk exists", async () => {
            const harness = createHarness("linux");
            harness.fileSystemOperations.markExisting("./.emsdk");
            await withStubbedFetch(
                () => Promise.reject(new Error("network should not be used")),
                () => harness.provisioner.provisionEmscriptenSdk(),
            );
            expect(harness.processRunner.commandHistory).toEqual([
                ["./.emsdk/emsdk", "install", "latest"],
                ["./.emsdk/emsdk", "activate", "latest"],
            ]);
            expect(harness.scopedLogger.warnings).toEqual([]);
        });
        test("stops after a failed install and warns", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = ["emsdk-main/emsdk.bat"];
            harness.processRunner.outcomeForCommand = (command) =>
                command[3] === "install"
                    ? { exitCode: 1, standardOutput: "", standardError: "python not found" }
                    : { exitCode: 0, standardOutput: "", standardError: "" };
            await withStubbedFetch(
                () => zipResponse({ "emsdk-main/emsdk.bat": "@echo off\n" }),
                () => harness.provisioner.provisionEmscriptenSdk(),
            );
            expect(harness.processRunner.commandHistory).toEqual([
                ["cmd", "/c", ".\\.emsdk\\emsdk.bat", "install", "latest"],
            ]);
            expect(
                harness.scopedLogger.warnings.some(
                    (warning) =>
                        warning.includes("Emscripten install failed") &&
                        warning.includes("python not found"),
                ),
            ).toBe(true);
        });
    });
    describe("provisionGoToolchain", () => {
        test("downloads and extracts the Go archive under ./.tools/go/", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = ["go/bin/go.exe", "go/go.env"];
            await withStubbedFetch(
                () =>
                    zipResponse({
                        "go/bin/go.exe": "binary",
                        "go/go.env": "GOROOT=go\n",
                    }),
                () => harness.provisioner.provisionGoToolchain(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.tools/go-staging/extracted/go/bin/go.exe",
                "./.tools/go-staging/extracted/go/go.env",
            ]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                ["./.tools/go-staging/extracted/go", "./.tools/go"],
            ]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([]);
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.scopedLogger.successes).toContain("Go provisioned at ./.tools/go.");
        });
        test("skips when the probe binary already exists", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.tools/go/bin/go.exe");
            await harness.provisioner.provisionGoToolchain();
            expect(harness.fileSystemOperations.writtenFiles).toEqual([]);
            expect(harness.scopedLogger.informations).toContain(
                "Go already provisioned, skipping.",
            );
        });
    });
    describe("provisionZigToolchain", () => {
        test("downloads, extracts, and aliases the probe path", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = [
                "zig-x86_64-windows-0.17.0/zig.exe",
                "zig-x86_64-windows-0.17.0/LICENSE",
            ];
            await withStubbedFetch(
                () =>
                    zipResponse({
                        "zig-x86_64-windows-0.17.0/zig.exe": "binary",
                        "zig-x86_64-windows-0.17.0/LICENSE": "license",
                    }),
                () => harness.provisioner.provisionZigToolchain(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.tools/zig-staging/extracted/zig-x86_64-windows-0.17.0/zig.exe",
                "./.tools/zig-staging/extracted/zig-x86_64-windows-0.17.0/LICENSE",
            ]);
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                ["./.tools/zig-staging/extracted/zig-x86_64-windows-0.17.0", "./.tools/zig"],
            ]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([
                ["./.tools/zig/zig.exe", "./.tools/zig/zig"],
            ]);
            expect(harness.fileSystemOperations.removedPaths).toContain("./.tools/zig-staging");
            expect(harness.scopedLogger.warnings).toEqual([]);
            expect(harness.scopedLogger.successes).toEqual(["Zig provisioned at ./.tools/zig."]);
        });
        test("skips when the probe binary already exists", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.tools/zig/zig");
            await harness.provisioner.provisionZigToolchain();
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.fileSystemOperations.writtenFiles).toEqual([]);
            expect(harness.scopedLogger.informations).toContain(
                "Zig already provisioned, skipping.",
            );
        });
        test("warns and cleans staging when the download fails", async () => {
            const harness = createHarness("win32");
            await withStubbedFetch(
                () => Promise.reject(new Error("network down")),
                () => harness.provisioner.provisionZigToolchain(),
            );
            expect(
                harness.scopedLogger.warnings.some(
                    (warning) =>
                        warning.startsWith("Zig provisioning failed") &&
                        warning.includes("network down"),
                ),
            ).toBe(true);
            expect(harness.fileSystemOperations.removedPaths).toContain("./.tools/zig-staging");
            expect(harness.fileSystemOperations.copiedPairs).toEqual([]);
        });
        test("warns and cleans staging when the zip is corrupt", async () => {
            const harness = createHarness("win32");
            await withStubbedFetch(
                () => responseWithBody(new Uint8Array([1, 2, 3, 4])),
                () => harness.provisioner.provisionZigToolchain(),
            );
            expect(
                harness.scopedLogger.warnings.some((warning) =>
                    warning.startsWith("Zig provisioning failed"),
                ),
            ).toBe(true);
            expect(harness.fileSystemOperations.removedPaths).toContain("./.tools/zig-staging");
        });
        test("warns instead of downloading on non-Windows platforms", async () => {
            const harness = createHarness("linux");
            await harness.provisioner.provisionZigToolchain();
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(
                harness.scopedLogger.warnings.some(
                    (warning) => warning.includes("Zig") && warning.includes("manually"),
                ),
            ).toBe(true);
        });
    });
    describe("provisionWasmPackToolchain", () => {
        test("downloads the release tarball and extracts wasm-pack.exe", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = [
                "wasm-pack-v0.15.0-x86_64-pc-windows-msvc/wasm-pack.exe",
                "wasm-pack-v0.15.0-x86_64-pc-windows-msvc/LICENSE",
            ];
            await withStubbedFetch(
                () => responseWithBody(new Uint8Array([31, 139, 8, 0])),
                () => harness.provisioner.provisionWasmPackToolchain(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.tools/wasm-pack-staging/wasm-pack-v0.15.0-x86_64-pc-windows-msvc.tar.gz",
            ]);
            expect(harness.processRunner.commandHistory).toEqual([
                [
                    "tar",
                    "-xf",
                    "./.tools/wasm-pack-staging/wasm-pack-v0.15.0-x86_64-pc-windows-msvc.tar.gz",
                    "-C",
                    "./.tools/wasm-pack-staging/extracted",
                ],
            ]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                [
                    "./.tools/wasm-pack-staging/extracted/wasm-pack-v0.15.0-x86_64-pc-windows-msvc",
                    "./.tools/wasm-pack",
                ],
            ]);
            expect(harness.scopedLogger.successes).toContain(
                "wasm-pack provisioned at ./.tools/wasm-pack.",
            );
        });
    });
    describe("provisionJdkToolchain", () => {
        test("downloads and extracts the Temurin JDK zip under ./.tools/jdk/", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = [
                "jdk-21.0.8+9/bin/java.exe",
                "jdk-21.0.8+9/bin/java.dll",
            ];
            await withStubbedFetch(
                () =>
                    zipResponse({
                        "jdk-21.0.8+9/bin/java.exe": "binary",
                        "jdk-21.0.8+9/bin/java.dll": "library",
                    }),
                () => harness.provisioner.provisionJdkToolchain(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.tools/jdk-staging/extracted/jdk-21.0.8+9/bin/java.exe",
                "./.tools/jdk-staging/extracted/jdk-21.0.8+9/bin/java.dll",
            ]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                ["./.tools/jdk-staging/extracted/jdk-21.0.8+9", "./.tools/jdk"],
            ]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([]);
            expect(harness.scopedLogger.successes).toContain(
                "Temurin JDK provisioned at ./.tools/jdk.",
            );
        });
    });
    describe("provisionMavenToolchain", () => {
        test("downloads and extracts the Maven zip under ./.tools/maven/", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = [
                "apache-maven-3.9.16/bin/mvn.cmd",
                "apache-maven-3.9.16/bin/mvn",
            ];
            await withStubbedFetch(
                () =>
                    zipResponse({
                        "apache-maven-3.9.16/bin/mvn.cmd": "@echo off\n",
                        "apache-maven-3.9.16/bin/mvn": "#!/bin/sh\n",
                    }),
                () => harness.provisioner.provisionMavenToolchain(),
            );
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                ["./.tools/maven-staging/extracted/apache-maven-3.9.16", "./.tools/maven"],
            ]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([]);
            expect(harness.scopedLogger.successes).toContain(
                "Apache Maven provisioned at ./.tools/maven.",
            );
        });
    });
    describe("provisionChromeForTesting", () => {
        test("resolves the stable win64 download and extracts chrome.exe", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = [
                "chrome-win64/chrome.exe",
                "chrome-win64/LICENSE",
            ];
            const versionsPayload = {
                channels: {
                    Stable: {
                        downloads: {
                            chrome: [
                                {
                                    platform: "win64",
                                    url: "https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/win64/chrome-win64.zip",
                                },
                                {
                                    platform: "linux64",
                                    url: "https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip",
                                },
                            ],
                        },
                    },
                },
            };
            await withStubbedFetch(
                (input) =>
                    String(input).includes("last-known-good-versions")
                        ? jsonResponse(versionsPayload)
                        : zipResponse({
                              "chrome-win64/chrome.exe": "binary",
                              "chrome-win64/LICENSE": "license",
                          }),
                () => harness.provisioner.provisionChromeForTesting(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.tools/chrome-for-testing-staging/extracted/chrome-win64/chrome.exe",
                "./.tools/chrome-for-testing-staging/extracted/chrome-win64/LICENSE",
            ]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                [
                    "./.tools/chrome-for-testing-staging/extracted/chrome-win64",
                    "./.tools/chrome-for-testing",
                ],
            ]);
            expect(harness.scopedLogger.successes).toContain(
                "Chrome for Testing provisioned at ./.tools/chrome-for-testing.",
            );
        });
        test("skips the version lookup when chrome.exe already exists", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.tools/chrome-for-testing/chrome.exe");
            let fetchCount = 0;
            await withStubbedFetch(
                () => {
                    fetchCount += 1;
                    return Promise.reject(new Error("should not fetch"));
                },
                () => harness.provisioner.provisionChromeForTesting(),
            );
            expect(fetchCount).toBe(0);
            expect(harness.scopedLogger.informations).toContain(
                "Chrome for Testing already provisioned, skipping.",
            );
        });
        test("warns when the version lookup fails", async () => {
            const harness = createHarness("win32");
            await withStubbedFetch(
                () => Promise.reject(new Error("offline")),
                () => harness.provisioner.provisionChromeForTesting(),
            );
            expect(
                harness.scopedLogger.warnings.some((warning) =>
                    warning.includes("Chrome for Testing version lookup failed"),
                ),
            ).toBe(true);
        });
    });
    describe("provisionKotlinWasmToolchain", () => {
        test("treats kotlinc-js.bat as present and mirrors it to the probed path", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.tools/kotlin-wasm/bin/kotlinc-js.bat");
            await harness.provisioner.provisionKotlinWasmToolchain();
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([
                ["./.tools/kotlin-wasm/bin/kotlinc-js.bat", "./.tools/kotlin-wasm/bin/kotlinc-js"],
            ]);
            expect(harness.scopedLogger.informations).toContain(
                "Kotlin/JS already provisioned, skipping.",
            );
        });
    });
    describe("provisionDartSdk", () => {
        test("downloads and extracts the Dart SDK under ./.tools/dart-sdk/", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.listedFiles = [
                "dart-sdk/bin/dart.exe",
                "dart-sdk/bin/dartaotruntime.exe",
            ];
            await withStubbedFetch(
                () =>
                    zipResponse({
                        "dart-sdk/bin/dart.exe": "binary",
                        "dart-sdk/bin/dartaotruntime.exe": "binary",
                    }),
                () => harness.provisioner.provisionDartSdk(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.tools/dart-sdk-staging/extracted/dart-sdk/bin/dart.exe",
                "./.tools/dart-sdk-staging/extracted/dart-sdk/bin/dartaotruntime.exe",
            ]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                ["./.tools/dart-sdk-staging/extracted/dart-sdk", "./.tools/dart-sdk"],
            ]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([
                ["./.tools/dart-sdk/bin/dart.exe", "./.tools/dart-sdk/bin/dart"],
            ]);
        });
    });
    describe("provisionDotNetSdk", () => {
        test("skips download and workload install when both are present", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.tools/dotnet/dotnet.exe");
            harness.processRunner.outcomeForCommand = () => ({
                exitCode: 0,
                standardOutput:
                    "Installed Workload Id  Manifest Version  Installation Source\nwasm-tools 10.0.401",
                standardError: "",
            });
            await harness.provisioner.provisionDotNetSdk();
            expect(harness.fileSystemOperations.writtenFiles).toEqual([]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([
                ["./.tools/dotnet/dotnet.exe", "./.tools/dotnet/dotnet"],
            ]);
            expect(harness.processRunner.commandHistory).toEqual([
                ["./.tools/dotnet/dotnet", "workload", "list"],
            ]);
            expect(harness.scopedLogger.informations).toContain(
                "dotnet wasm-tools workload already installed, skipping.",
            );
        });
        test("installs the wasm-tools workload when it is missing", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.tools/dotnet/dotnet.exe");
            harness.processRunner.outcomeForCommand = (command) =>
                command.includes("list")
                    ? { exitCode: 0, standardOutput: "aspnet", standardError: "" }
                    : { exitCode: 0, standardOutput: "", standardError: "" };
            await harness.provisioner.provisionDotNetSdk();
            expect(harness.processRunner.commandHistory).toEqual([
                ["./.tools/dotnet/dotnet", "workload", "list"],
                ["./.tools/dotnet/dotnet", "workload", "install", "wasm-tools"],
            ]);
            expect(harness.scopedLogger.successes).toContain(
                "dotnet wasm-tools workload installed.",
            );
        });
    });
    describe("provisionSwiftWasmToolchain", () => {
        test("warns that no standalone toolchain release exists", async () => {
            const harness = createHarness("win32");
            await harness.provisioner.provisionSwiftWasmToolchain();
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.fileSystemOperations.ensuredDirectories).toContain(
                "./.tools/swift-wasm",
            );
            expect(
                harness.scopedLogger.warnings.some((warning) => warning.includes("Swift SDK")),
            ).toBe(true);
        });
    });
    describe("provisionTeaVmToolchain", () => {
        test("keeps the marker directory when absent", async () => {
            const harness = createHarness("win32");
            await harness.provisioner.provisionTeaVmToolchain();
            expect(harness.fileSystemOperations.ensuredDirectories).toContain("./.tools/teavm");
            expect(harness.scopedLogger.warnings.some((warning) => warning.includes("Maven"))).toBe(
                true,
            );
        });
        test("skips when the marker directory exists", async () => {
            const harness = createHarness("win32");
            harness.fileSystemOperations.markExisting("./.tools/teavm");
            await harness.provisioner.provisionTeaVmToolchain();
            expect(harness.scopedLogger.informations).toContain(
                "TeaVM already provisioned, skipping.",
            );
        });
    });
    describe("provisionOcamlWasmToolchain", () => {
        test("warns that no prebuilt distribution exists", async () => {
            const harness = createHarness("win32");
            await harness.provisioner.provisionOcamlWasmToolchain();
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.fileSystemOperations.ensuredDirectories).toContain(
                "./.tools/ocaml-wasm",
            );
            expect(harness.scopedLogger.warnings.some((warning) => warning.includes("opam"))).toBe(
                true,
            );
        });
    });
    describe("provisionGhcWasmToolchain", () => {
        test("does not download the bindist on Windows", async () => {
            const harness = createHarness("win32");
            await harness.provisioner.provisionGhcWasmToolchain();
            expect(harness.processRunner.commandHistory).toEqual([]);
            expect(harness.fileSystemOperations.writtenFiles).toEqual([]);
            expect(
                harness.scopedLogger.warnings.some(
                    (warning) => warning.includes("GHC WASM") && warning.includes("linux"),
                ),
            ).toBe(true);
        });
        test("downloads and extracts the bindist on Linux", async () => {
            const harness = createHarness("linux");
            harness.fileSystemOperations.listedFiles = [
                "ghc-wasm/bin/wasm32-wasi-ghc",
                "ghc-wasm/lib/settings",
            ];
            await withStubbedFetch(
                () => responseWithBody(new Uint8Array([253, 55, 122, 88])),
                () => harness.provisioner.provisionGhcWasmToolchain(),
            );
            expect(harness.fileSystemOperations.writtenFiles).toEqual([
                "./.tools/ghc-wasm-staging/wasm32-wasi-ghc-gmp.tar.xz",
            ]);
            expect(harness.fileSystemOperations.movedPairs).toEqual([
                ["./.tools/ghc-wasm-staging/extracted/ghc-wasm", "./.tools/ghc-wasm"],
            ]);
            expect(harness.fileSystemOperations.copiedPairs).toEqual([]);
        });
    });
    describe("provisionAllToolchains", () => {
        test("never rejects when every download fails", async () => {
            const harness = createHarness("win32");
            await withStubbedFetch(
                () => Promise.reject(new Error("offline")),
                () => harness.provisioner.provisionAllToolchains(),
            );
            expect(harness.scopedLogger.warnings.length).toBeGreaterThan(0);
        });
    });
});
