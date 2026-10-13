import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
interface DuckDbResultTable {
    schema: { fields: ReadonlyArray<{ name: string }> };
    toArray(): Array<unknown>;
}
interface DuckDbConnection {
    query(statement: string): Promise<DuckDbResultTable>;
    close(): Promise<void> | void;
}
interface DuckDbDatabase {
    instantiate(mainModuleUrl: string, pthreadWorkerUrl: string | null): Promise<void>;
    connect(): Promise<DuckDbConnection>;
}
interface DuckDbRuntimeModule {
    AsyncDuckDB: new (logger: unknown, worker: Worker) => DuckDbDatabase;
    VoidLogger: new () => unknown;
}
function splitDuckDbStatements(sourceText: string): Array<string> {
    const statements: Array<string> = [];
    let currentStatement = "";
    let quoteCharacter = "";
    let lineComment = false;
    let blockComment = false;
    const pushStatement = (): void => {
        const trimmedStatement = currentStatement.trim();
        if (trimmedStatement.length > 0) {
            statements.push(trimmedStatement);
        }
        currentStatement = "";
    };
    for (let index = 0; index < sourceText.length; index++) {
        const character = sourceText[index] as string;
        const nextCharacter = sourceText[index + 1];
        if (lineComment) {
            currentStatement += character;
            if (character === "\n") {
                lineComment = false;
            }
            continue;
        }
        if (blockComment) {
            currentStatement += character;
            if (character === "*" && nextCharacter === "/") {
                currentStatement += nextCharacter;
                index++;
                blockComment = false;
            }
            continue;
        }
        if (quoteCharacter.length > 0) {
            currentStatement += character;
            if (character === quoteCharacter) {
                if (nextCharacter === quoteCharacter) {
                    currentStatement += nextCharacter;
                    index++;
                    continue;
                }
                quoteCharacter = "";
            }
            continue;
        }
        if (character === "'" || character === '"') {
            quoteCharacter = character;
            currentStatement += character;
            continue;
        }
        if (character === "-" && nextCharacter === "-") {
            lineComment = true;
            currentStatement += character;
            continue;
        }
        if (character === "/" && nextCharacter === "*") {
            blockComment = true;
            currentStatement += character;
            continue;
        }
        if (character === ";") {
            pushStatement();
            continue;
        }
        currentStatement += character;
    }
    pushStatement();
    return statements;
}
class DuckDbWasmPerformer implements TerminalPerformerContract {
    private readonly sessionBaseUrl: string;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private runtimeModule: DuckDbRuntimeModule | undefined;
    private database: DuckDbDatabase | undefined;
    private entrySourceText: string = "";
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading DuckDB runtime.");
        try {
            this.runtimeModule = (await import(
                /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/duckdb/duckdb-runtime.js`
            )) as DuckDbRuntimeModule;
            const worker = new Worker(
                `${this.sessionBaseUrl}/runtime/duckdb/duckdb-browser-eh.worker.js`,
            );
            const logger = new this.runtimeModule.VoidLogger();
            this.database = new this.runtimeModule.AsyncDuckDB(logger, worker);
            await this.database.instantiate(
                `${this.sessionBaseUrl}/runtime/duckdb/duckdb-eh.wasm`,
                null,
            );
        } catch (loadError) {
            const loadMessage = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`DuckDB runtime failed to load: ${loadMessage}`);
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        const entrySourceText = fetchedFiles.userFiles.get(fetchedFiles.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(
                `Entry script ${fetchedFiles.entryRelativePath} is missing from the session.`,
            );
        }
        this.entrySourceText = entrySourceText;
        stage.writeLine("DuckDB runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.database) {
            throw new Error("DuckDB runtime not loaded. Call loadInto first.");
        }
        stage.writeLine("Running SQL script.");
        this.outputTracker.beginRun();
        try {
            const connection = await this.database.connect();
            try {
                for (const statement of splitDuckDbStatements(this.entrySourceText)) {
                    const resultTable = await connection.query(statement);
                    this.appendResultRows(resultTable);
                }
            } finally {
                await connection.close();
            }
        } catch (runError) {
            throw new Error(this.describeDuckDbError(runError));
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private appendResultRows(resultTable: DuckDbResultTable): void {
        const columnNames = resultTable.schema.fields.map((field) => field.name);
        for (const row of resultTable.toArray()) {
            const rowObject = this.rowObjectOf(row);
            const renderedCells = columnNames.map((columnName) =>
                this.formatCell(rowObject[columnName]),
            );
            this.outputTracker.appendText(renderedCells.join(" | ") + "\n");
        }
    }
    private rowObjectOf(row: unknown): Record<string, unknown> {
        const shapedRow = row as { toJSON?: () => Record<string, unknown> };
        if (typeof shapedRow?.toJSON === "function") {
            return shapedRow.toJSON();
        }
        return row as Record<string, unknown>;
    }
    private formatCell(cell: unknown): string {
        if (cell === null || cell === undefined) {
            return "NULL";
        }
        return String(cell);
    }
    private describeDuckDbError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { DuckDbWasmPerformer, splitDuckDbStatements };
