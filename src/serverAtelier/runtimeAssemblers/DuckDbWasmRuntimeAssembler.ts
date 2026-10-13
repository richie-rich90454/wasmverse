import { posix } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import {
    findRemoteAssetOrigins,
    scrubRemoteAssetOrigins,
} from "@serverAtelier/utilities/RemoteAssetScrubber.ts";
const DUCKDB_RUNTIME_DIRECTORY_NAME = "duckdb";
const DUCKDB_PACKAGE_DIRECTORY = "./node_modules/@duckdb/duckdb-wasm/dist";
const ARROW_PACKAGE_DIRECTORY = "./node_modules/apache-arrow";
const FLATBUFFERS_PACKAGE_DIRECTORY = "./node_modules/flatbuffers/mjs";
const TSLIB_PACKAGE_DIRECTORY = "./node_modules/tslib";
const DUCKDB_BROWSER_MODULE_PACKAGE_FILE_NAME = "duckdb-browser.mjs";
const DUCKDB_BROWSER_MODULE_EXPORT_FILE_NAME = "duckdb-runtime.js";
const DUCKDB_WORKER_PACKAGE_FILE_NAME = "duckdb-browser-eh.worker.js";
const DUCKDB_WORKER_EXPORT_FILE_NAME = "duckdb-browser-eh.worker.js";
const DUCKDB_WASM_PACKAGE_FILE_NAME = "duckdb-eh.wasm";
const DUCKDB_WASM_EXPORT_FILE_NAME = "duckdb-eh.wasm";
const ARROW_ENTRY_PACKAGE_FILE_NAME = "Arrow.dom.mjs";
const ARROW_DIRECTORY_EXPORT_NAME = "apache-arrow";
const ARROW_ENTRY_EXPORT_FILE_NAME = `${ARROW_DIRECTORY_EXPORT_NAME}/Arrow.dom.js`;
const ARROW_BARE_SPECIFIER = 'from"apache-arrow"';
const ARROW_RELATIVE_SPECIFIER = `from"./${ARROW_ENTRY_EXPORT_FILE_NAME}"`;
const FLATBUFFERS_ENTRY_PACKAGE_FILE_NAME = "flatbuffers.js";
const FLATBUFFERS_DIRECTORY_EXPORT_NAME = "flatbuffers";
const FLATBUFFERS_ENTRY_EXPORT_FILE_NAME = `${FLATBUFFERS_DIRECTORY_EXPORT_NAME}/${FLATBUFFERS_ENTRY_PACKAGE_FILE_NAME}`;
const TSLIB_PACKAGE_FILE_NAME = "tslib.es6.mjs";
const TSLIB_EXPORT_FILE_NAME = "tslib.js";
const WORKER_STREAMING_GUARD =
    "WebAssembly.instantiateStreaming = (source, imports) => WebAssembly.instantiate(source, imports);\n";
const BARE_SPECIFIER_REWRITES: ReadonlyMap<string, string> = new Map([
    ["flatbuffers", FLATBUFFERS_ENTRY_EXPORT_FILE_NAME],
    ["tslib", TSLIB_EXPORT_FILE_NAME],
]);
const SPECIFIER_PATTERN = /\bfrom\s*(['"])([^'"]+)\1/g;
class DuckDbWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly duckdbPackageDirectory: string;
    private readonly arrowPackageDirectory: string;
    private readonly flatbuffersPackageDirectory: string;
    private readonly tslibPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        duckdbPackageDirectory: string = DUCKDB_PACKAGE_DIRECTORY,
        arrowPackageDirectory: string = ARROW_PACKAGE_DIRECTORY,
        flatbuffersPackageDirectory: string = FLATBUFFERS_PACKAGE_DIRECTORY,
        tslibPackageDirectory: string = TSLIB_PACKAGE_DIRECTORY,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.duckdbPackageDirectory = duckdbPackageDirectory;
        this.arrowPackageDirectory = arrowPackageDirectory;
        this.flatbuffersPackageDirectory = flatbuffersPackageDirectory;
        this.tslibPackageDirectory = tslibPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${DUCKDB_RUNTIME_DIRECTORY_NAME}`;
        const browserModuleSourcePath = `${this.duckdbPackageDirectory}/${DUCKDB_BROWSER_MODULE_PACKAGE_FILE_NAME}`;
        const workerSourcePath = `${this.duckdbPackageDirectory}/${DUCKDB_WORKER_PACKAGE_FILE_NAME}`;
        const wasmSourcePath = `${this.duckdbPackageDirectory}/${DUCKDB_WASM_PACKAGE_FILE_NAME}`;
        for (const [packageFileName, sourcePath] of [
            [DUCKDB_BROWSER_MODULE_PACKAGE_FILE_NAME, browserModuleSourcePath],
            [DUCKDB_WORKER_PACKAGE_FILE_NAME, workerSourcePath],
            [DUCKDB_WASM_PACKAGE_FILE_NAME, wasmSourcePath],
            [`apache-arrow/${ARROW_ENTRY_PACKAGE_FILE_NAME}`, this.arrowEntrySourcePath()],
            [
                `flatbuffers/${FLATBUFFERS_ENTRY_PACKAGE_FILE_NAME}`,
                `${this.flatbuffersPackageDirectory}/${FLATBUFFERS_ENTRY_PACKAGE_FILE_NAME}`,
            ],
            [TSLIB_PACKAGE_FILE_NAME, `${this.tslibPackageDirectory}/${TSLIB_PACKAGE_FILE_NAME}`],
        ] as ReadonlyArray<[string, string]>) {
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(
                    `DuckDB runtime file ${packageFileName} is missing. Run pnpm install.`,
                );
            }
        }
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${DUCKDB_BROWSER_MODULE_EXPORT_FILE_NAME}`,
            this.assertNoRemoteAssetOrigins(
                DUCKDB_BROWSER_MODULE_EXPORT_FILE_NAME,
                await this.buildHostSafeBrowserModule(browserModuleSourcePath),
            ),
        );
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${DUCKDB_WORKER_EXPORT_FILE_NAME}`,
            this.assertNoRemoteAssetOrigins(
                DUCKDB_WORKER_EXPORT_FILE_NAME,
                scrubRemoteAssetOrigins(
                    WORKER_STREAMING_GUARD +
                        (await this.fileSystemOperations.readTextFile(workerSourcePath)),
                ),
            ),
        );
        await this.fileSystemOperations.copyFileInto(
            wasmSourcePath,
            `${runtimeDirectory}/${DUCKDB_WASM_EXPORT_FILE_NAME}`,
        );
        await this.copyModuleGraphInto(runtimeDirectory);
        await this.copySharedModuleFilesInto(runtimeDirectory);
    }
    private arrowEntrySourcePath(): string {
        return `${this.arrowPackageDirectory}/${ARROW_ENTRY_PACKAGE_FILE_NAME}`;
    }
    private async buildHostSafeBrowserModule(sourcePath: string): Promise<string> {
        const sourceText = await this.fileSystemOperations.readTextFile(sourcePath);
        const arrowPatchedText = sourceText
            .split(ARROW_BARE_SPECIFIER)
            .join(ARROW_RELATIVE_SPECIFIER);
        if (arrowPatchedText === sourceText) {
            throw new Error(
                `${DUCKDB_BROWSER_MODULE_PACKAGE_FILE_NAME} no longer imports apache-arrow. Reinstall @duckdb/duckdb-wasm and recheck the runtime patch.`,
            );
        }
        return scrubRemoteAssetOrigins(arrowPatchedText);
    }
    private assertNoRemoteAssetOrigins(relativePath: string, text: string): string {
        const remoteOrigins = findRemoteAssetOrigins(text);
        if (remoteOrigins.length > 0) {
            throw new Error(
                `${relativePath} would reach out to ${remoteOrigins[0]}. Runtime assets must be self contained.`,
            );
        }
        return text;
    }
    private async copyModuleGraphInto(runtimeDirectory: string): Promise<void> {
        const pendingRelativePaths: Array<string> = [ARROW_ENTRY_PACKAGE_FILE_NAME];
        const copiedRelativePaths: Set<string> = new Set();
        while (pendingRelativePaths.length > 0) {
            const sourceRelativePath = pendingRelativePaths.shift() as string;
            if (copiedRelativePaths.has(sourceRelativePath)) {
                continue;
            }
            copiedRelativePaths.add(sourceRelativePath);
            const sourcePath = `${this.arrowPackageDirectory}/${sourceRelativePath}`;
            if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
                throw new Error(
                    `apache-arrow file ${sourceRelativePath} is missing. Run pnpm install.`,
                );
            }
            const sourceText = await this.fileSystemOperations.readTextFile(sourcePath);
            const patchedSource = this.patchArrowModuleSource(sourceText, sourceRelativePath);
            pendingRelativePaths.push(...patchedSource.importedRelativePaths);
            await this.fileSystemOperations.writeTextFile(
                `${runtimeDirectory}/${ARROW_DIRECTORY_EXPORT_NAME}/${sourceRelativePath.slice(0, -".mjs".length)}.js`,
                patchedSource.patchedText,
            );
        }
    }
    private patchArrowModuleSource(
        sourceText: string,
        sourceRelativePath: string,
    ): { patchedText: string; importedRelativePaths: Array<string> } {
        const importedRelativePaths: Array<string> = [];
        const patchedLines = sourceText.split("\n").map((line) => {
            const trimmedLine = line.trimStart();
            if (
                trimmedLine.startsWith("*") ||
                trimmedLine.startsWith("//") ||
                trimmedLine.startsWith("/*")
            ) {
                return line;
            }
            return line.replace(
                SPECIFIER_PATTERN,
                (match: string, quoteCharacter: string, specifier: string) => {
                    if (specifier.startsWith(".")) {
                        const resolvedRelativePath = posix.normalize(
                            posix.join(posix.dirname(sourceRelativePath), specifier),
                        );
                        importedRelativePaths.push(resolvedRelativePath);
                        return `from${quoteCharacter}${specifier.replace(/\.mjs$/, ".js")}${quoteCharacter}`;
                    }
                    const bareRewrite = BARE_SPECIFIER_REWRITES.get(specifier);
                    if (!bareRewrite) {
                        throw new Error(
                            `apache-arrow file ${sourceRelativePath} imports ${specifier}. Reinstall apache-arrow and recheck the runtime patch.`,
                        );
                    }
                    const relativeSpecifier = this.relativeSpecifierFrom(
                        `${ARROW_DIRECTORY_EXPORT_NAME}/${sourceRelativePath}`,
                        bareRewrite,
                    );
                    return `from${quoteCharacter}${relativeSpecifier}${quoteCharacter}`;
                },
            );
        });
        return { patchedText: patchedLines.join("\n"), importedRelativePaths };
    }
    private relativeSpecifierFrom(sourceRelativePath: string, targetRelativePath: string): string {
        const relativeSpecifier = posix.relative(
            posix.dirname(sourceRelativePath),
            targetRelativePath,
        );
        return relativeSpecifier.startsWith(".") ? relativeSpecifier : `./${relativeSpecifier}`;
    }
    private async copySharedModuleFilesInto(runtimeDirectory: string): Promise<void> {
        const flatbuffersSourcePaths = await this.fileSystemOperations.listFilesRecursively(
            this.flatbuffersPackageDirectory,
        );
        for (const relativePath of flatbuffersSourcePaths) {
            if (!relativePath.endsWith(".js")) {
                continue;
            }
            await this.fileSystemOperations.copyFileInto(
                `${this.flatbuffersPackageDirectory}/${relativePath}`,
                `${runtimeDirectory}/${FLATBUFFERS_DIRECTORY_EXPORT_NAME}/${relativePath}`,
            );
        }
        await this.fileSystemOperations.copyFileInto(
            `${this.tslibPackageDirectory}/${TSLIB_PACKAGE_FILE_NAME}`,
            `${runtimeDirectory}/${TSLIB_EXPORT_FILE_NAME}`,
        );
    }
}
export { DuckDbWasmRuntimeAssembler };
