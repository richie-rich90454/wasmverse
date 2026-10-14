const SOLIDITY_COMPILE_CALLBACK_SIGNATURE = "viiiii";
interface SoljsonModule {
    cwrap(
        name: string,
        returnType: string | null,
        argumentTypes: ReadonlyArray<string>,
    ): (...args: ReadonlyArray<unknown>) => unknown;
    addFunction(callback: (...args: ReadonlyArray<number>) => void, signature: string): number;
    removeFunction(pointer: number): void;
    UTF8ToString(pointer: number): string;
    lengthBytesUTF8(text: string): number;
    stringToUTF8(text: string, pointer: number, maximumBytes: number): void;
    setValue(pointer: number, value: number, type: string): void;
    calledRun?: boolean;
    onRuntimeInitialized?: () => void;
}
interface SolidityHostWindow {
    Module?: SoljsonModule;
    __wasmverseSolidityRuntime?: { module: SoljsonModule };
}
interface SolidityCompilerInstance {
    version: string;
    compileStandardJson(
        inputJson: string,
        importResolver: (importPath: string) => { contents?: string; error?: string },
    ): string;
}
async function loadSolidityCompiler(scriptUrl: string): Promise<SolidityCompilerInstance> {
    const hostWindow = window as unknown as SolidityHostWindow;
    if (!hostWindow.__wasmverseSolidityRuntime) {
        let markInitialized: () => void = () => {};
        const runtimeInitialized = new Promise<void>((resolveInitialized) => {
            markInitialized = resolveInitialized;
        });
        const moduleRecord: Record<string, unknown> = {
            print: () => {},
            printErr: () => {},
            onRuntimeInitialized: () => markInitialized(),
        };
        hostWindow.Module = moduleRecord as unknown as SoljsonModule;
        const scriptElement = document.createElement("script");
        scriptElement.src = scriptUrl;
        const scriptLoaded = new Promise<void>((resolveLoaded, rejectLoaded) => {
            scriptElement.addEventListener("load", () => resolveLoaded(), { once: true });
            scriptElement.addEventListener(
                "error",
                () => rejectLoaded(new Error("the compiler script failed to load")),
                { once: true },
            );
        });
        document.head.appendChild(scriptElement);
        await scriptLoaded;
        await runtimeInitialized;
        hostWindow.__wasmverseSolidityRuntime = { module: hostWindow.Module as SoljsonModule };
    }
    return wrapSolidityModule(hostWindow.__wasmverseSolidityRuntime.module);
}
function wrapSolidityModule(module: SoljsonModule): SolidityCompilerInstance {
    const compileFunction = module.cwrap("solidity_compile", "string", [
        "string",
        "number",
        "number",
    ]) as (inputJson: string, callbackPointer: number, contextPointer: number) => string;
    const versionFunction = module.cwrap("solidity_version", "string", []) as () => string;
    const version = versionFunction();
    return {
        version,
        compileStandardJson(inputJson, importResolver) {
            const callback = (
                _context: number,
                kind: number,
                data: number,
                contents: number,
                error: number,
            ): void => {
                const kindText = module.UTF8ToString(kind);
                if (kindText !== "source") {
                    writeCString(module, "SMT solver callback not supported", error);
                    return;
                }
                const importPath = module.UTF8ToString(data);
                const resolved = importResolver(importPath);
                if (resolved.contents !== undefined) {
                    writeCString(module, resolved.contents, contents);
                    return;
                }
                writeCString(module, resolved.error ?? `File not found: ${importPath}`, error);
            };
            const callbackPointer = module.addFunction(
                callback,
                SOLIDITY_COMPILE_CALLBACK_SIGNATURE,
            );
            try {
                return compileFunction(inputJson, callbackPointer, 0);
            } finally {
                module.removeFunction(callbackPointer);
            }
        },
    };
}
function writeCString(module: SoljsonModule, text: string, pointer: number): void {
    const byteLength = module.lengthBytesUTF8(text);
    const bufferPointer = (
        module.cwrap("solidity_alloc", "number", ["number"]) as (byteCount: number) => number
    )(byteLength + 1);
    module.stringToUTF8(text, bufferPointer, byteLength + 1);
    module.setValue(pointer, bufferPointer, "*");
}
export { loadSolidityCompiler };
export type { SolidityCompilerInstance };
