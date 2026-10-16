import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
interface PgliteQueryResult {
    rows: Array<Record<string, unknown>>;
}
interface PgliteDatabase {
    waitReady: Promise<void>;
    exec(sqlText: string): Promise<Array<PgliteQueryResult>>;
}
interface PgliteRuntimeModule {
    PGlite: new (options: Record<string, unknown>) => PgliteDatabase;
}
class PglitePerformer implements TerminalPerformerContract {
    private readonly assetLocator: RuntimeAssetLocator;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private runtimeModule: PgliteRuntimeModule | undefined;
    private entrySourceText: string = "";
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading PGlite runtime.");
        try {
            this.runtimeModule = (await import(
                /* @vite-ignore */ this.assetLocator.resolveAssetUrl(
                    "runtime/pglite/pglite-runtime.js",
                )
            )) as PgliteRuntimeModule;
        } catch (loadError) {
            const loadMessage = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`PGlite runtime failed to load: ${loadMessage}`);
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        const entrySourceText = fetchedFiles.userFiles.get(fetchedFiles.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(
                `Entry script ${fetchedFiles.entryRelativePath} is missing from the session.`,
            );
        }
        this.entrySourceText = entrySourceText;
        stage.writeLine("PGlite runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.runtimeModule) {
            throw new Error("PGlite runtime not loaded. Call loadInto first.");
        }
        stage.writeLine("Running SQL script.");
        this.outputTracker.beginRun();
        try {
            const wasmModule = await this.compileWasmModule(
                this.assetLocator.resolveAssetUrl("runtime/pglite/pglite.wasm"),
            );
            const initdbWasmModule = await this.compileWasmModule(
                this.assetLocator.resolveAssetUrl("runtime/pglite/initdb.wasm"),
            );
            const dataBundle = await this.fetchBinary(
                this.assetLocator.resolveAssetUrl("runtime/pglite/pglite.data"),
            );
            const database = new this.runtimeModule.PGlite({
                pgliteWasmModule: wasmModule,
                initdbWasmModule,
                fsBundle: new Blob([dataBundle]),
            });
            await database.waitReady;
            const queryResults = await database.exec(this.entrySourceText);
            for (const queryResult of queryResults) {
                this.appendResultRows(queryResult);
            }
        } catch (runError) {
            throw new Error(this.describePgliteError(runError));
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private async compileWasmModule(wasmUrl: string): Promise<WebAssembly.Module> {
        return await WebAssembly.compile(await this.fetchBinary(wasmUrl));
    }
    private async fetchBinary(assetUrl: string): Promise<ArrayBuffer> {
        const assetResponse = await fetch(assetUrl);
        if (!assetResponse.ok) {
            throw new Error(`${assetUrl} request failed with status ${assetResponse.status}.`);
        }
        return await assetResponse.arrayBuffer();
    }
    private appendResultRows(queryResult: PgliteQueryResult): void {
        for (const row of queryResult.rows) {
            const renderedCells = Object.values(row).map((cell) => this.formatCell(cell));
            this.outputTracker.appendText(renderedCells.join(" | ") + "\n");
        }
    }
    private formatCell(cell: unknown): string {
        if (cell === null || cell === undefined) {
            return "NULL";
        }
        return String(cell);
    }
    private describePgliteError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { PglitePerformer };
