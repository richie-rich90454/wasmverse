import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
interface SqliteDatabase {
    pointer: number;
    close(): void;
}
interface SqliteExecCallback {
    (values: Array<unknown>, columnNames: Array<string>): number;
}
interface SqliteCapi {
    sqlite3_exec(
        databasePointer: number,
        sql: string,
        callback: SqliteExecCallback,
        callbackData: number,
        errorPointer: number,
    ): number;
    sqlite3_errmsg(databasePointer: number): string;
}
interface SqliteInstance {
    oo1: { DB: new (fileName: string, openFlags?: string) => SqliteDatabase };
    capi: SqliteCapi;
}
interface SqliteRuntimeModule {
    default: (config: { locateFile: (fileName: string) => string }) => Promise<SqliteInstance>;
}
class SqliteRuntimeLoader {
    private readonly sessionBaseUrl: string;
    private runtimeModule: SqliteRuntimeModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntimeModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading SQLite runtime.");
        this.runtimeModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/sqlite/sqlite-runtime.js`
        )) as SqliteRuntimeModule;
    }
    async createInstance(): Promise<SqliteInstance> {
        if (!this.runtimeModule) {
            throw new Error("SQLite runtime not loaded. Call loadRuntimeModule first.");
        }
        return await this.runtimeModule.default({
            locateFile: (fileName: string) => `${this.sessionBaseUrl}/runtime/sqlite/${fileName}`,
        });
    }
}
class SqliteWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: SqliteRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private sqliteInstance: SqliteInstance | undefined;
    private entrySourceText: string = "";
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new SqliteRuntimeLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        try {
            await this.runtimeLoader.loadRuntimeModule(stage);
            this.sqliteInstance = await this.runtimeLoader.createInstance();
        } catch (loadError) {
            const loadMessage = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`SQLite runtime failed to load: ${loadMessage}`);
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        const entrySourceText = fetchedFiles.userFiles.get(fetchedFiles.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(
                `Entry script ${fetchedFiles.entryRelativePath} is missing from the session.`,
            );
        }
        this.entrySourceText = entrySourceText;
        stage.writeLine("SQLite runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.sqliteInstance) {
            throw new Error("SQLite runtime not loaded. Call loadInto first.");
        }
        stage.writeLine("Running SQL script.");
        this.outputTracker.beginRun();
        try {
            const database = new this.sqliteInstance.oo1.DB(":memory:", "c");
            try {
                const resultCode = this.sqliteInstance.capi.sqlite3_exec(
                    database.pointer,
                    this.entrySourceText,
                    (values) => {
                        this.appendResultRow(values);
                        return 0;
                    },
                    0,
                    0,
                );
                if (resultCode !== 0) {
                    throw new Error(this.sqliteInstance.capi.sqlite3_errmsg(database.pointer));
                }
            } finally {
                database.close();
            }
        } catch (runError) {
            throw new Error(this.describeSqliteError(runError));
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private appendResultRow(row: Array<unknown>): void {
        const renderedCells = row.map((cell) => (cell === null ? "NULL" : String(cell)));
        this.outputTracker.appendText(renderedCells.join(" | ") + "\n");
    }
    private describeSqliteError(runError: unknown): string {
        const shapedError = runError as { message?: unknown } | undefined;
        const rawMessage =
            runError instanceof Error ? runError.message : String(shapedError?.message ?? runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { SqliteWasmPerformer };
