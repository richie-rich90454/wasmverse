import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const PHP_RUNTIME_FILE_NAMES = [
    "PhpWeb.mjs",
    "PhpBase.mjs",
    "_Event.mjs",
    "fsOps.mjs",
    "OutputBuffer.mjs",
    "webTransactions.mjs",
    "resolveDependencies.mjs",
    "php8.4-web.mjs",
    "e31ec3faf3e2323a2b4a448342b50307765b8217.wasm",
];
const HOST_SAFE_MODULE_EXTENSION = ".js";
class PhpWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly phpPackageDirectory: string;
    private readonly phpRuntimeFileNames: ReadonlyArray<string>;
    constructor(
        fileSystemOperations: FileSystemOperations,
        phpPackageDirectory: string = "./node_modules/php-wasm",
        phpRuntimeFileNames: ReadonlyArray<string> = PHP_RUNTIME_FILE_NAMES,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.phpPackageDirectory = phpPackageDirectory;
        this.phpRuntimeFileNames = phpRuntimeFileNames;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        for (const runtimeFileName of this.phpRuntimeFileNames) {
            const sourcePath = `${this.phpPackageDirectory}/${runtimeFileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(`PHP runtime file ${runtimeFileName} not found. Run bun install.`);
            }
            if (!runtimeFileName.endsWith(".mjs")) {
                await this.fileSystemOperations.copyFileInto(
                    sourcePath,
                    `${context.runtimeDirectory}/php-wasm/${runtimeFileName}`,
                );
                continue;
            }
            const sourceText = await this.fileSystemOperations.readTextFile(sourcePath);
            const hostSafeName = `${runtimeFileName.slice(0, -".mjs".length)}${HOST_SAFE_MODULE_EXTENSION}`;
            await this.fileSystemOperations.writeTextFile(
                `${context.runtimeDirectory}/php-wasm/${hostSafeName}`,
                sourceText.split(".mjs").join(HOST_SAFE_MODULE_EXTENSION),
            );
        }
    }
}
export { PhpWasmRuntimeAssembler };
