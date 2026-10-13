import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const GO_LOADER_FILE_NAME = "go-loader.js";
const GO_TOOLCHAIN_DIRECTORY = "./.tools/go";
const WASM_EXEC_RELATIVE_PATHS = ["lib/wasm/wasm_exec.js", "misc/wasm/wasm_exec.js"];
class GoWasmExecRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
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
        for (const relativePath of WASM_EXEC_RELATIVE_PATHS) {
            const candidatePath = `${GO_TOOLCHAIN_DIRECTORY}/${relativePath}`;
            if (await this.fileSystemOperations.pathExists(candidatePath)) {
                await this.fileSystemOperations.copyFileInto(
                    candidatePath,
                    `${runtimeDirectory}/wasm_exec.js`,
                );
                return;
            }
        }
        throw new Error(
            "Go wasm_exec.js not found. Run pnpm run setup to provision the Go toolchain under ./.tools/go/.",
        );
    }
}
export { GoWasmExecRuntimeAssembler };
