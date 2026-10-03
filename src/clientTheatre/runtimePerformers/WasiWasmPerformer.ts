import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { WASI, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
type WasiExportedEntry = () => Promise<unknown> | unknown;
const WASI_MODULE_NAMESPACE = "wasi_snapshot_preview1";
/**
 * Modules compiled for `wasm32-wasi` import their host calls from the
 * `wasi_snapshot_preview1` namespace, so the shim's flat import table has to be
 * nested under that name before it reaches `WebAssembly.instantiate`. Handing over
 * the flat table instead fails to link with "module is not an object or function".
 */
class WasiImportObjectBuilder {
    buildFor(wasiInstance: WASI): WebAssembly.Imports {
        return {
            [WASI_MODULE_NAMESPACE]:
                wasiInstance.wasiImport as unknown as WebAssembly.ModuleImports,
        };
    }
}
class WasiWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    private readonly importObjectBuilder: WasiImportObjectBuilder;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
        this.importObjectBuilder = new WasiImportObjectBuilder();
    }
    async loadInstance(stage: TerminalStageController): Promise<WebAssembly.Instance> {
        stage.writeLine("Loading WASI module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/wasi-loader.js`
        )) as {
            instantiateWasiModule(
                baseUrl: string,
                importObject: WebAssembly.Imports,
            ): Promise<WebAssembly.Instance>;
        };
        // The shim indexes this array by file descriptor number, so every standard
        // descriptor the program may write to needs its own slot. Zig's
        // `std.debug.print` writes to stderr, which lands on index 2.
        const writeToTerminal = (bytes: Uint8Array) =>
            stage.writeText(WasiWasmModuleLoader.decode(bytes));
        const wasiInstance = new WASI(
            [],
            [],
            [
                new ConsoleStdout(writeToTerminal),
                new ConsoleStdout(writeToTerminal),
                new ConsoleStdout(writeToTerminal),
            ],
        );
        const instance = await loaderModule.instantiateWasiModule(
            `${this.sessionBaseUrl}/runtime`,
            this.importObjectBuilder.buildFor(wasiInstance),
        );
        // `initialize` binds the instance the shim's import closures read memory
        // through, and only calls `_initialize` when the module exports one. A
        // command module such as Zig's exports `_start` instead, so skipping this
        // leaves the shim reading an unbound instance on the first host call.
        wasiInstance.initialize(
            instance as unknown as Parameters<typeof wasiInstance.initialize>[0],
        );
        return instance;
    }
    private static decode(bytes: Uint8Array): string {
        return new TextDecoder().decode(bytes);
    }
}
class WasiEntryInvoker {
    async invokeEntry(
        instance: WebAssembly.Instance,
        stage: TerminalStageController,
    ): Promise<void> {
        const exports = instance.exports as Record<string, unknown>;
        const entryFunction = (exports["main"] ?? exports["_start"]) as
            | WasiExportedEntry
            | undefined;
        if (typeof entryFunction !== "function") {
            throw new Error("WASI module exposes neither a main nor a _start export.");
        }
        stage.writeLine("Running WASI entry point.");
        await entryFunction();
    }
}
class WasiWasmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: WasiWasmModuleLoader;
    private readonly entryInvoker: WasiEntryInvoker;
    private loadedInstance: WebAssembly.Instance | undefined;
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new WasiWasmModuleLoader(sessionBaseUrl);
        this.entryInvoker = new WasiEntryInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedInstance = await this.moduleLoader.loadInstance(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedInstance) {
            throw new Error("WASI module not loaded. Call loadInto first.");
        }
        await this.entryInvoker.invokeEntry(this.loadedInstance, stage);
    }
}
export { WasiWasmPerformer };
