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
        const outcome = await this.processRunner.runToCompletion(
            [
                this.goBinaryPath,
                "build",
                "-o",
                `${context.runtimeDirectory}/app.wasm`,
                context.entryFileRelativePath,
            ],
            {
                workingDirectory: context.sourceDirectory,
                environmentOverrides: {
                    GOOS: "js",
                    GOARCH: "wasm",
                    GO111MODULE: "on",
                    GOROOT: resolve(process.cwd(), GO_TOOLCHAIN_DIRECTORY),
                    GOPATH: resolve(process.cwd(), "./.tools/gopath"),
                    GOCACHE: resolve(process.cwd(), "./.tools/go-cache"),
                },
            },
        );
        if (outcome.exitCode !== 0) {
            throw new Error(`Go WASM build failed: ${outcome.standardError}`);
        }
    }
}
export { GoWasmCompilerStrategy };
