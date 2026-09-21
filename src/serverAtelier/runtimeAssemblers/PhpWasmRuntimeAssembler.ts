import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class PhpWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly phpPackageDirectory: string;
    private readonly phpRuntimeFileNames: ReadonlyArray<string>;
    constructor(
        fileSystemOperations: FileSystemOperations,
        phpPackageDirectory: string = "./node_modules/php-wasm",
        phpRuntimeFileNames: ReadonlyArray<string> = [
            "PhpWeb.mjs",
            "PhpBase.mjs",
            "_Event.mjs",
            "fsOps.mjs",
            "OutputBuffer.mjs",
            "webTransactions.mjs",
            "resolveDependencies.mjs",
            "php8.4-web.mjs",
            "e31ec3faf3e2323a2b4a448342b50307765b8217.wasm",
        ],
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.phpPackageDirectory = phpPackageDirectory;
        this.phpRuntimeFileNames = phpRuntimeFileNames;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        for (const runtimeFileName of this.phpRuntimeFileNames) {
            const sourcePath = `${this.phpPackageDirectory}/${runtimeFileName}`;
            const fileExists = await this.fileSystemOperations.pathExists(sourcePath);
            if (!fileExists) {
                throw new Error(`PHP runtime file ${runtimeFileName} not found. Run bun install.`);
            }
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${context.runtimeDirectory}/php-wasm/${runtimeFileName}`,
            );
        }
    }
}
export { PhpWasmRuntimeAssembler };
