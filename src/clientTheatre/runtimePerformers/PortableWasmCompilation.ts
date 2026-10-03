type StreamingSource = Response | PromiseLike<Response> | BufferSource | WebAssembly.Module;
type StreamingResult = Promise<WebAssembly.WebAssemblyInstantiatedSource>;
type StreamingFunction = (
    source: StreamingSource,
    importObject?: WebAssembly.Imports,
) => StreamingResult;
function isThenable(value: unknown): value is PromiseLike<unknown> {
    return typeof (value as PromiseLike<unknown> | undefined)?.then === "function";
}
async function bufferFromStreamingSource(source: StreamingSource): Promise<BufferSource> {
    if (typeof Response !== "undefined" && source instanceof Response) {
        return await source.arrayBuffer();
    }
    if (isThenable(source)) {
        const resolvedSource = await source;
        if (typeof Response !== "undefined" && resolvedSource instanceof Response) {
            return await resolvedSource.arrayBuffer();
        }
        throw new TypeError("WebAssembly streaming was given a non response source.");
    }
    return source as BufferSource;
}
/**
 * Object storage hosts map `.wasm` to `application/octet-stream`, which makes the
 * browser reject `WebAssembly.instantiateStreaming` with a MIME type error. Rather
 * than deleting the streaming entry points, this installs buffer backed stand ins
 * that accept the same arguments. Runtimes that branch on feature detection keep
 * working, and the ones that call `instantiateStreaming` unconditionally, such as
 * the Emscripten output php-wasm ships, compile from an `ArrayBuffer` instead.
 */
function forceBufferBasedWasmCompilation(): void {
    const wasmNamespace = WebAssembly as unknown as {
        instantiateStreaming?: StreamingFunction;
        instantiate: (bytes: BufferSource, importObject?: WebAssembly.Imports) => StreamingResult;
        compileStreaming?: (source: StreamingSource) => Promise<WebAssembly.Module>;
        compile: (bytes: BufferSource) => Promise<WebAssembly.Module>;
    };
    wasmNamespace.instantiateStreaming = async (source, importObject) =>
        await wasmNamespace.instantiate(await bufferFromStreamingSource(source), importObject);
    wasmNamespace.compileStreaming = async (source) =>
        await wasmNamespace.compile(await bufferFromStreamingSource(source));
}
export { forceBufferBasedWasmCompilation };
export type { StreamingFunction, StreamingSource };
