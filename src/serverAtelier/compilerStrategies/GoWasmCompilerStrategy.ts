import { resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const GO_TOOLCHAIN_DIRECTORY = "./.tools/go";
const DEFAULT_GO_BINARY_PATH =
    process.platform === "win32" ? "./.tools/go/bin/go.exe" : "./.tools/go/bin/go";
class GoWasmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly goBinaryPath: string;
    constructor(processRunner: ProcessRunner, goBinaryPath: string = DEFAULT_GO_BINARY_PATH) {
        this.processRunner = processRunner;
        this.fileSystemOperations = new FileSystemOperations();
        this.goBinaryPath = goBinaryPath;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        if (!(await this.fileSystemOperations.pathExists(this.goBinaryPath))) {
            throw new Error(
                "Go toolchain not found. Run pnpm run setup to provision ./.tools/go/.",
            );
        }
        const moduleFilePath = `${context.sourceDirectory}/go.mod`;
        if (!(await this.fileSystemOperations.pathExists(moduleFilePath))) {
            await this.fileSystemOperations.writeTextFile(
                moduleFilePath,
                "module wasmverse\n\ngo 1.22\n",
            );
        }
        const entryDirectory = context.entryFileRelativePath.includes("/")
            ? context.entryFileRelativePath.split("/").slice(0, -1).join("/")
            : ".";
        const outcome = await this.processRunner.runToCompletion(
            [
                this.goBinaryPath,
                "build",
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
                entryDirectory === "." ? "." : `./${entryDirectory}`,
            ],
            {
                workingDirectory: context.sourceDirectory,
                environmentOverrides: {
                    GOOS: "js",
                    GOARCH: "wasm",
                    GO111MODULE: "on",
                    GOFLAGS: "-mod=mod",
                    GOROOT: resolve(process.cwd(), GO_TOOLCHAIN_DIRECTORY),
                    GOPATH: resolve(process.cwd(), "./.tools/gopath"),
                    GOCACHE: resolve(process.cwd(), "./.tools/go-cache"),
                },
            },
        );
        if (outcome.exitCode !== 0) {
            // `go build` reports some failures, such as a contended build cache, on
            // standard output only, so both streams are needed for a real reason.
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`Go WASM build failed: ${detail}`);
        }
    }
}
export { GoWasmCompilerStrategy };
