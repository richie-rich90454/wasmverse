import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const PGLITE_RUNTIME_DIRECTORY_NAME = "pglite";
const PGLITE_ENTRY_PACKAGE_FILE_NAME = "index.js";
const PGLITE_ENTRY_EXPORT_FILE_NAME = "pglite-runtime.js";
const PGLITE_WASM_PACKAGE_FILE_NAME = "pglite.wasm";
const PGLITE_INITDB_WASM_PACKAGE_FILE_NAME = "initdb.wasm";
const PGLITE_DATA_PACKAGE_FILE_NAME = "pglite.data";
const PGLITE_CHUNK_FILE_PREFIX = "chunk-";
const PGLITE_STREAMING_INSTANTIATION_PATTERN =
    /WebAssembly\.instantiateStreaming\(([^,]+?(?:\([^()]*\))?)\s*,\s*([A-Za-z_$][\w$]*)\)/g;
const PGLITE_BUFFERED_INSTANTIATION =
    "WebAssembly.instantiate(await Promise.resolve($1).then((response) => response.arrayBuffer()), $2)";
class PgliteRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly pglitePackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        pglitePackageDirectory: string = "./node_modules/@electric-sql/pglite/dist",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.pglitePackageDirectory = pglitePackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${PGLITE_RUNTIME_DIRECTORY_NAME}`;
        const entrySourcePath = `${this.pglitePackageDirectory}/${PGLITE_ENTRY_PACKAGE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(entrySourcePath))) {
            throw new Error(
                `PGlite runtime file ${PGLITE_ENTRY_PACKAGE_FILE_NAME} is missing. Run pnpm install.`,
            );
        }
        for (const packageFileName of [
            PGLITE_WASM_PACKAGE_FILE_NAME,
            PGLITE_INITDB_WASM_PACKAGE_FILE_NAME,
            PGLITE_DATA_PACKAGE_FILE_NAME,
        ]) {
            const sourcePath = `${this.pglitePackageDirectory}/${packageFileName}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(
                    `PGlite runtime file ${packageFileName} is missing. Run pnpm install.`,
                );
            }
            await this.fileSystemOperations.copyFileInto(
                sourcePath,
                `${runtimeDirectory}/${packageFileName}`,
            );
        }
        let replacedInstantiationCount = 0;
        const entrySourceText = await this.fileSystemOperations.readTextFile(entrySourcePath);
        if (!entrySourceText.includes("./chunk-")) {
            throw new Error(
                `${PGLITE_ENTRY_PACKAGE_FILE_NAME} no longer imports pglite chunks. Reinstall @electric-sql/pglite and recheck the runtime patch.`,
            );
        }
        const patchedEntry = this.patchStreamingInstantiation(entrySourceText);
        replacedInstantiationCount += patchedEntry.replacedCount;
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${PGLITE_ENTRY_EXPORT_FILE_NAME}`,
            patchedEntry.patchedText,
        );
        const packageFilePaths = await this.fileSystemOperations.listFilesRecursively(
            this.pglitePackageDirectory,
        );
        for (const relativePath of packageFilePaths) {
            if (
                !relativePath.startsWith(PGLITE_CHUNK_FILE_PREFIX) ||
                !relativePath.endsWith(".js")
            ) {
                continue;
            }
            const sourceText = await this.fileSystemOperations.readTextFile(
                `${this.pglitePackageDirectory}/${relativePath}`,
            );
            const patchedChunk = this.patchStreamingInstantiation(sourceText);
            replacedInstantiationCount += patchedChunk.replacedCount;
            await this.fileSystemOperations.writeTextFile(
                `${runtimeDirectory}/${relativePath}`,
                patchedChunk.patchedText,
            );
        }
        if (replacedInstantiationCount === 0) {
            throw new Error(
                `PGlite chunks no longer stream their wasm. Reinstall @electric-sql/pglite and recheck the runtime patch.`,
            );
        }
    }
    private patchStreamingInstantiation(sourceText: string): {
        patchedText: string;
        replacedCount: number;
    } {
        const replacedCount = sourceText.match(PGLITE_STREAMING_INSTANTIATION_PATTERN)?.length ?? 0;
        return {
            patchedText: sourceText.replace(
                PGLITE_STREAMING_INSTANTIATION_PATTERN,
                PGLITE_BUFFERED_INSTANTIATION,
            ),
            replacedCount,
        };
    }
}
export { PgliteRuntimeAssembler };
