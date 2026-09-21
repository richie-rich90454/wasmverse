import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
interface PhpWebModule {
    PhpWeb: new (args: Record<string, unknown>) => unknown;
}
interface PhpRuntime {
    onoutput: ((event: { detail: Array<string> }) => void) | undefined;
    onerror: ((event: { detail: Array<string> }) => void) | undefined;
    writeFile(path: string, data: string): Promise<void>;
    run(code: string): Promise<unknown>;
    flush(): void;
}
class PhpWasmLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntime(stage: TerminalStageController): Promise<PhpRuntime> {
        stage.writeLine("Loading PHP runtime.");
        try {
            const runtimeBaseUrl = `${this.sessionBaseUrl}/runtime`;
            const phpWebModule = (await import(
                /* @vite-ignore */ `${runtimeBaseUrl}/php-wasm/PhpWeb.mjs`
            )) as PhpWebModule;
            const phpRuntime = new phpWebModule.PhpWeb({
                version: "8.4",
                locateFile: (path: string) => {
                    if (String(path).endsWith(".wasm")) {
                        const fileName = String(path).split("/").pop() as string;
                        return `${runtimeBaseUrl}/php-wasm/${fileName}`;
                    }
                    return undefined;
                },
            }) as unknown as PhpRuntime;
            phpRuntime.onoutput = (event: { detail: Array<string> }) => {
                stage.writeText(event.detail[0] ?? "");
            };
            phpRuntime.onerror = (event: { detail: Array<string> }) => {
                stage.writeText(event.detail[0] ?? "");
            };
            return phpRuntime;
        } catch (loadError) {
            throw new Error(
                `PHP runtime failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
        }
    }
}
class PhpWasmFileSystemWriter {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async fetchUserFiles(): Promise<{ entryFileName: string; userFiles: Map<string, string> }> {
        const manifestResponse = await fetch(`${this.sessionBaseUrl}/user-code/manifest.json`);
        if (!manifestResponse.ok) {
            throw new Error("Session manifest is missing. Rebuild the session and retry.");
        }
        const manifest = (await manifestResponse.json()) as {
            entryFileRelativePath: string;
            includedFileRelativePaths: Array<string>;
        };
        const userFiles = new Map<string, string>();
        for (const relativePath of manifest.includedFileRelativePaths) {
            if (relativePath === "manifest.json") {
                continue;
            }
            const fileResponse = await fetch(`${this.sessionBaseUrl}/user-code/${relativePath}`);
            if (!fileResponse.ok) {
                throw new Error(`User file ${relativePath} is missing from the session.`);
            }
            const fileName = relativePath.split("/").pop() as string;
            userFiles.set(fileName, await fileResponse.text());
        }
        const entryFileName = manifest.entryFileRelativePath.split("/").pop() as string;
        return { entryFileName, userFiles };
    }
}
class PhpWasmEntryExecutor {
    async executeEntry(
        phpRuntime: PhpRuntime,
        entryFileName: string,
        userFiles: ReadonlyMap<string, string>,
        stage: TerminalStageController,
    ): Promise<void> {
        stage.writeLine("Running PHP entry script.");
        try {
            for (const [fileName, fileContent] of userFiles) {
                await phpRuntime.writeFile(`/${fileName}`, fileContent);
            }
            const entrySource = userFiles.get(entryFileName);
            if (entrySource === undefined) {
                throw new Error(`Entry file ${entryFileName} is missing from the session.`);
            }
            await phpRuntime.run(entrySource);
            phpRuntime.flush();
        } catch (runError) {
            throw new Error(
                `PHP error: ${runError instanceof Error ? runError.message : String(runError)}`,
            );
        }
    }
}
class PhpWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: PhpWasmLoader;
    private readonly fileSystemWriter: PhpWasmFileSystemWriter;
    private readonly entryExecutor: PhpWasmEntryExecutor;
    private loadedRuntime: PhpRuntime | undefined;
    private entryFileName: string = "";
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new PhpWasmLoader(sessionBaseUrl);
        this.fileSystemWriter = new PhpWasmFileSystemWriter(sessionBaseUrl);
        this.entryExecutor = new PhpWasmEntryExecutor();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedRuntime = await this.runtimeLoader.loadRuntime(stage);
        const fetchedFiles = await this.fileSystemWriter.fetchUserFiles();
        this.entryFileName = fetchedFiles.entryFileName;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("PHP runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedRuntime) {
            throw new Error("PHP runtime not loaded. Call loadInto first.");
        }
        await this.entryExecutor.executeEntry(
            this.loadedRuntime,
            this.entryFileName,
            this.userFiles,
            stage,
        );
    }
}
export { PhpWasmPerformer };
