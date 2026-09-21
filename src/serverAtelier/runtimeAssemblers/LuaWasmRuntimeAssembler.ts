import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class LuaWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly wasmoonPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        wasmoonPackageDirectory: string = "./node_modules/wasmoon",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.wasmoonPackageDirectory = wasmoonPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        const glueSourcePath = `${this.wasmoonPackageDirectory}/dist/glue.wasm`;
        const glueExists = await this.fileSystemOperations.pathExists(glueSourcePath);
        if (!glueExists) {
            throw new Error("Lua binary not found. Run bun install to fetch wasmoon.");
        }
        await this.fileSystemOperations.copyFileInto(
            glueSourcePath,
            `${context.runtimeDirectory}/glue.wasm`,
        );
    }
}
export { LuaWasmRuntimeAssembler };
