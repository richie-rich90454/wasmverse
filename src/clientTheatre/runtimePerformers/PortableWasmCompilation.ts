function forceBufferBasedWasmCompilation(): void {
    const wasmNamespace = WebAssembly as unknown as { instantiateStreaming?: unknown };
    if (typeof wasmNamespace.instantiateStreaming === "function") {
        wasmNamespace.instantiateStreaming = undefined;
    }
}
export { forceBufferBasedWasmCompilation };
