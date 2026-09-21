import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class GoWasmExecRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/go-loader.mjs`,
            'import "./wasm_exec.js"; export function createGoRunner(){ return new Go(); }\n',
        );
        const gorootWasmExec = `${process.env.GOROOT ?? "/usr/local/go"}/misc/wasm/wasm_exec.js`;
        const wasmExecExists = await this.fileSystemOperations.pathExists(gorootWasmExec);
        if (wasmExecExists) {
            await this.fileSystemOperations.copyFileInto(
                gorootWasmExec,
                `${context.runtimeDirectory}/wasm_exec.js`,
            );
        }
    }
}
export { GoWasmExecRuntimeAssembler };
