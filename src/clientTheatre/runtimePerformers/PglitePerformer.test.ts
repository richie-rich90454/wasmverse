import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PgliteRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/PgliteRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const packageAvailable = existsSync(
    join(process.cwd(), "node_modules/@electric-sql/pglite/dist/index.js"),
);
describe.skipIf(!packageAvailable)("PgliteRuntimeAssembler", () => {
    test("copies the runtime, patches streaming instantiation, and renames the entry", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-pglite-"));
        try {
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new PgliteRuntimeAssembler(new FileSystemOperations());
            await assembler.assembleRuntimeInto({
                sessionIdentifier: "test-session",
                sessionDirectory: fixtureDirectory,
                sourceDirectory: join(fixtureDirectory, "source"),
                runtimeDirectory,
                userCodeDirectory: join(fixtureDirectory, "user-code"),
                entryFileRelativePath: "main.pglite.sql",
                programArguments: [],
                languageIdentifier: "pglite",
            });
            const loaderText = await readFile(
                join(runtimeDirectory, "pglite/pglite-runtime.js"),
                "utf8",
            );
            expect(loaderText).toContain("./chunk-");
            for (const assetFileName of ["pglite.wasm", "initdb.wasm", "pglite.data"]) {
                await expect(
                    readFile(join(runtimeDirectory, `pglite/${assetFileName}`)),
                ).resolves.toBeTruthy();
            }
            const chunkFileNames = (await readdir(join(runtimeDirectory, "pglite"))).filter(
                (fileName) => fileName.startsWith("chunk-") && fileName.endsWith(".js"),
            );
            expect(chunkFileNames.length).toBeGreaterThan(0);
            for (const chunkFileName of chunkFileNames) {
                const chunkText = await readFile(
                    join(runtimeDirectory, `pglite/${chunkFileName}`),
                    "utf8",
                );
                expect(chunkText).not.toMatch(/WebAssembly\.instantiateStreaming\(/);
            }
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
