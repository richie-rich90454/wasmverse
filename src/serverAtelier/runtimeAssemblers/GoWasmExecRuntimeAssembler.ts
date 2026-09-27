import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const GO_LOADER_FILE_NAME = "go-loader.js";
const WASM_EXEC_RELATIVE_PATHS = ["lib/wasm/wasm_exec.js", "misc/wasm/wasm_exec.js"];
class GoWasmExecRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly processRunner: ProcessRunner;
    constructor(
        fileSystemOperations: FileSystemOperations,
        processRunner: ProcessRunner = new ProcessRunner(),
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.processRunner = processRunner;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/${GO_LOADER_FILE_NAME}`,
            'import "./wasm_exec.js"; export function createGoRunner(){ return new Go(); }\n',
        );
        await this.copyWasmExecScript(context.runtimeDirectory);
    }
    private async copyWasmExecScript(runtimeDirectory: string): Promise<void> {
        for (const gorootCandidate of await this.collectGorootCandidates()) {
            for (const relativePath of WASM_EXEC_RELATIVE_PATHS) {
                const candidatePath = `${gorootCandidate}/${relativePath}`;
                if (await this.fileSystemOperations.pathExists(candidatePath)) {
                    await this.fileSystemOperations.copyFileInto(
                        candidatePath,
                        `${runtimeDirectory}/wasm_exec.js`,
                    );
                    return;
                }
            }
        }
        throw new Error(
            "Go wasm_exec.js not found. Confirm the Go toolchain is installed and `go env GOROOT` resolves.",
        );
    }
    private async collectGorootCandidates(): Promise<Array<string>> {
        const candidates: Array<string> = [];
        if (process.env.GOROOT) {
            candidates.push(process.env.GOROOT);
        }
        try {
            const reportedRoot = (
                await this.processRunner.runAndCollectStandardOutput(["go", "env", "GOROOT"])
            ).trim();
            if (reportedRoot.length > 0) {
                candidates.push(reportedRoot);
            }
        } catch {
            // A missing `go` binary is reported by the caller with a readable message.
        }
        return candidates;
    }
}
export { GoWasmExecRuntimeAssembler };
