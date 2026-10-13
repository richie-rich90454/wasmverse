import { describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { packProjectArchive } from "@clientTheatre/services/ProjectArchivePacker.ts";
describe("packProjectArchive", () => {
    test("round trips text files through a zip", () => {
        const archiveBytes = packProjectArchive(
            new Map([
                ["main.py", "print('hi')"],
                ["lib/util.py", "x = 1"],
            ]),
        );
        const unzippedEntries = unzipSync(archiveBytes);
        expect(strFromU8(unzippedEntries["main.py"] as Uint8Array)).toBe("print('hi')");
        expect(strFromU8(unzippedEntries["lib/util.py"] as Uint8Array)).toBe("x = 1");
    });
    test("passes binary contents through unchanged", () => {
        const binaryContents = new Uint8Array([0, 1, 2, 255]);
        const archiveBytes = packProjectArchive(new Map([["asset.bin", binaryContents]]));
        const unzippedEntries = unzipSync(archiveBytes);
        expect([...(unzippedEntries["asset.bin"] as Uint8Array)]).toEqual([0, 1, 2, 255]);
    });
    test("packs an empty project into a readable empty archive", () => {
        expect(Object.keys(unzipSync(packProjectArchive(new Map())))).toEqual([]);
    });
});
