import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const SQLITE_RUNTIME_DIRECTORY_NAME = "sqlite";
const SQLITE_LOADER_PACKAGE_FILE_NAME = "index.mjs";
const SQLITE_LOADER_EXPORT_FILE_NAME = "sqlite-runtime.js";
const SQLITE_WASM_PACKAGE_FILE_NAME = "sqlite3.wasm";
const SQLITE_WASM_EXPORT_FILE_NAME = "sqlite3.wasm";
const STREAMING_INSTANTIATION = "return await WebAssembly.instantiateStreaming(response, imports);";
const BUFFERED_INSTANTIATION =
    "return await WebAssembly.instantiate(await (await response).arrayBuffer(), imports);";
class SqliteWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly sqlitePackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        sqlitePackageDirectory: string = "./node_modules/@sqlite.org/sqlite-wasm/dist",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.sqlitePackageDirectory = sqlitePackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${SQLITE_RUNTIME_DIRECTORY_NAME}`;
        const loaderSourcePath = `${this.sqlitePackageDirectory}/${SQLITE_LOADER_PACKAGE_FILE_NAME}`;
        const wasmSourcePath = `${this.sqlitePackageDirectory}/${SQLITE_WASM_PACKAGE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(loaderSourcePath))) {
            throw new Error(
                `SQLite runtime file ${SQLITE_LOADER_PACKAGE_FILE_NAME} is missing. Run pnpm install.`,
            );
        }
        if (!(await this.fileSystemOperations.pathExists(wasmSourcePath))) {
            throw new Error(
                `SQLite runtime file ${SQLITE_WASM_PACKAGE_FILE_NAME} is missing. Run pnpm install.`,
            );
        }
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${SQLITE_LOADER_EXPORT_FILE_NAME}`,
            await this.buildHostSafeLoaderModule(loaderSourcePath),
        );
        await this.fileSystemOperations.copyFileInto(
            wasmSourcePath,
            `${runtimeDirectory}/${SQLITE_WASM_EXPORT_FILE_NAME}`,
        );
    }
    private async buildHostSafeLoaderModule(loaderSourcePath: string): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(loaderSourcePath);
        const patchedText = sourceText.split(STREAMING_INSTANTIATION).join(BUFFERED_INSTANTIATION);
        if (patchedText === sourceText) {
            throw new Error(
                `${SQLITE_LOADER_PACKAGE_FILE_NAME} still streams its wasm. Reinstall @sqlite.org/sqlite-wasm and recheck the runtime patch.`,
            );
        }
        return patchedText;
    }
}
export { SqliteWasmRuntimeAssembler };
