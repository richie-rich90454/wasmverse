import { resolve } from "node:path";
import { build } from "esbuild";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import {
    findRemoteAssetOrigins,
    scrubRemoteAssetOrigins,
} from "@serverAtelier/utilities/RemoteAssetScrubber.ts";
const DUCKDB_RUNTIME_DIRECTORY_NAME = "duckdb";
const DUCKDB_PACKAGE_DIRECTORY = "./node_modules/@duckdb/duckdb-wasm/dist";
const DUCKDB_BROWSER_MODULE_PACKAGE_FILE_NAME = "duckdb-browser.mjs";
const DUCKDB_BROWSER_MODULE_EXPORT_FILE_NAME = "duckdb-runtime.js";
const DUCKDB_WORKER_PACKAGE_FILE_NAME = "duckdb-browser-eh.worker.js";
const DUCKDB_WORKER_EXPORT_FILE_NAME = "duckdb-browser-eh.worker.js";
const DUCKDB_WASM_PACKAGE_FILE_NAME = "duckdb-eh.wasm";
const DUCKDB_WASM_EXPORT_FILE_NAME = "duckdb-eh.wasm";
const WORKER_STREAMING_GUARD =
    'WebAssembly.instantiateStreaming = (source, imports) => Promise.resolve(source).then((value) => (value && typeof value.arrayBuffer === "function" ? value.arrayBuffer() : value)).then((bytes) => WebAssembly.instantiate(bytes, imports));\n';
class DuckDbWasmRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly duckdbPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        duckdbPackageDirectory: string = DUCKDB_PACKAGE_DIRECTORY,
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.duckdbPackageDirectory = duckdbPackageDirectory;
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
                scrubRemoteAssetOrigins(await this.bundleBrowserModule(browserModuleSourcePath)),
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
    }
    private async bundleBrowserModule(sourcePath: string): Promise<string> {
        let bundledText: string;
        try {
            const buildOutcome = await build({
                entryPoints: [resolve(process.cwd(), sourcePath)],
                bundle: true,
                write: false,
                format: "esm",
                platform: "browser",
                target: "es2020",
                minify: false,
                splitting: false,
                logLevel: "silent",
            });
            bundledText = buildOutcome.outputFiles[0]?.text ?? "";
        } catch (bundlingError) {
            const bundlingMessage =
                bundlingError instanceof Error ? bundlingError.message : String(bundlingError);
            throw new Error(`DuckDB runtime bundling failed: ${bundlingMessage}`);
        }
        if (bundledText.length === 0) {
            throw new Error("DuckDB runtime bundling produced no output. Run pnpm install.");
        }
        return bundledText;
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
}
export { DuckDbWasmRuntimeAssembler };
