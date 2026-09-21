import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class RubyWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly rubyBinaryPath: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        rubyBinaryPath: string = "./node_modules/@ruby/3.4-wasm-wasi/dist/ruby+stdlib.wasm",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.rubyBinaryPath = rubyBinaryPath;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        const binaryExists = await this.fileSystemOperations.pathExists(this.rubyBinaryPath);
        if (!binaryExists) {
            throw new Error("Ruby binary not found. Run bun install to fetch @ruby/3.4-wasm-wasi.");
        }
        await this.fileSystemOperations.copyFileInto(
            this.rubyBinaryPath,
            `${context.runtimeDirectory}/ruby.wasm`,
        );
    }
}
export { RubyWasmRuntimeAssembler };
