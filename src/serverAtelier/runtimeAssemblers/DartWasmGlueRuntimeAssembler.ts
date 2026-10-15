import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class DartWasmGlueRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/dart-loader.js`,
            `${EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE}\n` +
                'import { compile } from "./app.wasm.js";\n' +
                "export async function loadDartApp(baseUrl){ const response = await fetch(resolve(`${baseUrl}/app.wasm`)); if (!response.ok) { throw new Error(`app.wasm request failed with status ${response.status}`); } const compiled = await compile(await response.arrayBuffer()); return compiled.instantiate(); }\n" +
                "export async function loadDartRuntime(baseUrl){ const response = await fetch(resolve(`${baseUrl}/app.wasm`)); if (!response.ok) { throw new Error(`app.wasm request failed with status ${response.status}`); } const compiled = await compile(await response.arrayBuffer()); return { instantiateAttempt: async () => await compiled.instantiate() }; }\n" +
                'export function installDartWasmHostBridge(bridge){ globalThis.dartPrint = (value) => bridge.writeText(String(value) + "\\n"); globalThis.WasmVerseHost = { readLine: () => bridge.readLine(), getArguments: () => [...bridge.applicationArguments], readFile: (path) => Object.prototype.hasOwnProperty.call(bridge.userFiles, String(path)) ? bridge.userFiles[String(path)] : null, listFiles: () => Object.keys(bridge.userFiles) }; }\n',
        );
    }
}
export { DartWasmGlueRuntimeAssembler };
