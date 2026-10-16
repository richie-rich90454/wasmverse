import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class DotNetAppBundleRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    /**
     * A browser-wasm console publish ships a .NET app bundle. `dotnet.boot.js`
     * carries only the resource manifest as a `config` export, and `dotnet.js`
     * loads that manifest at boot, so importing `dotnet.js` alone fails with
     * "Failed to load config file". Feeding the manifest in with `withConfig`
     * and then creating and running the runtime calls the program's `Main`.
     */
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(context.runtimeDirectory);
        await this.fileSystemOperations.writeTextFile(
            `${context.runtimeDirectory}/dotnet-appbundle-loader.js`,
            [
                "export async function loadDotNetRuntime(baseUrl){",
                "  const bootModule = await import(`${baseUrl}/_framework/dotnet.boot.js`);",
                "  const runtimeModule = await import(`${baseUrl}/_framework/dotnet.js`);",
                "  const runtime = runtimeModule.dotnet;",
                // `run()` reaches the entry point through
                // `config.applicationArguments`. Leaving that unset makes the
                // runtime reach for `process.argv`, which a browser does not have,
                // so it hands a non string to the host and the entry point traps.
                // An export takes no arguments of its own.
                "  runtime.withConfig({ ...bootModule.config, applicationArguments: [] });",
                "  await runtime.download();",
                "  await runtime.create();",
                "  return runtime;",
                "}\n",
            ].join("\n"),
        );
    }
}
export { DotNetAppBundleRuntimeAssembler };
