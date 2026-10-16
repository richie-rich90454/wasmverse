import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE } from "@serverAtelier/runtimeAssemblers/EmbeddedAssetResolverGlue.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class BlazorGlueRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/blazor-loader.js`,
            `${EMBEDDED_ASSET_RESOLVER_GLUE_SOURCE}\n` +
                'export async function loadBlazorRuntime(){ await import("./wwwroot/_framework/blazor.webassembly.js"); return globalThis.Blazor; }\n' +
                'export async function createBlazorRuntimeAttempt(options){ const runtimeModule = await import(resolve(`${options.baseUrl}/dotnet.js?attempt=${options.attemptIndex}`)); const runtime = await runtimeModule.dotnet.withApplicationArguments(...options.applicationArguments).withResourceLoader((resourceType, resourceName, defaultUri) => (resourceType === "dotnetjs" || resourceType === "manifest") ? resolve(`${defaultUri}${defaultUri.indexOf("?") < 0 ? "?" : "&"}attempt=${options.attemptIndex}`) : resolve(defaultUri)).create(); const textEncoder = new TextEncoder(); for (const relativePath of Object.keys(options.userFiles)) { const separatorIndex = relativePath.lastIndexOf("/"); const directory = separatorIndex < 0 ? "/" : `/${relativePath.slice(0, separatorIndex)}`; const fileName = relativePath.slice(separatorIndex + 1); if (directory !== "/") { runtime.Module.FS_createPath("/", relativePath.slice(0, separatorIndex), true, true); } runtime.Module.FS_createDataFile(directory, fileName, textEncoder.encode(options.userFiles[relativePath]), true, false, true); } runtime.setModuleImports("WasmVerseHost", { readLine: () => options.readLine(), getArguments: () => [...options.applicationArguments], readFile: (path) => Object.prototype.hasOwnProperty.call(options.userFiles, String(path)) ? options.userFiles[String(path)] : null, listFiles: () => Object.keys(options.userFiles) }); return { runMain: () => runtime.runMain() }; }\n',
        );
    }
}
export { BlazorGlueRuntimeAssembler };
