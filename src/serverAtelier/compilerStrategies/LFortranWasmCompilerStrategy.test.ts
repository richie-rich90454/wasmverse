import { describe, expect, test } from "vitest";
import { hasTagSectionAfterGlobalSection } from "@serverAtelier/compilerStrategies/LFortranWasmCompilerStrategy.ts";
const WASM_HEADER_BYTES: ReadonlyArray<number> = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
function buildWasmWithSections(sections: ReadonlyArray<[number, number]>): Uint8Array {
    const wasmBytes: Array<number> = [...WASM_HEADER_BYTES];
    for (const [sectionId, sectionSize] of sections) {
        wasmBytes.push(sectionId);
        wasmBytes.push(0x80 | sectionSize, 0x80, 0x80, 0x00);
        for (let payloadIndex = 0; payloadIndex < sectionSize; payloadIndex += 1) {
            wasmBytes.push(0);
        }
    }
    return new Uint8Array(wasmBytes);
}
describe("hasTagSectionAfterGlobalSection", () => {
    test("detects an LFortran style tag section placed after the global section", () => {
        const wasmLoop = buildWasmWithSections([
            [1, 3],
            [2, 0],
            [6, 4],
            [7, 2],
            [13, 5],
        ]);
        expect(hasTagSectionAfterGlobalSection(wasmLoop)).toBe(true);
    });
    test("accepts a spec ordered module with the tag section before globals", () => {
        const wasmLoop = buildWasmWithSections([
            [1, 3],
            [13, 5],
            [6, 4],
            [7, 2],
        ]);
        expect(hasTagSectionAfterGlobalSection(wasmLoop)).toBe(false);
    });
    test("reports no problem for a module without a tag section", () => {
        const wasmLoop = buildWasmWithSections([
            [1, 3],
            [6, 4],
            [10, 6],
        ]);
        expect(hasTagSectionAfterGlobalSection(wasmLoop)).toBe(false);
    });
    test("does not claim detection for non wasm input", () => {
        const notWasm = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
        expect(hasTagSectionAfterGlobalSection(notWasm)).toBe(false);
    });
});
