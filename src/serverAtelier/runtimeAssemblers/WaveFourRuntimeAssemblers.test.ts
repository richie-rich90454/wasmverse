import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { WebRRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/WebRRuntimeAssembler.ts";
import { CherryCljsRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/CherryCljsRuntimeAssembler.ts";
import { BiwaschemeRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/BiwaschemeRuntimeAssembler.ts";
import { TauPrologRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/TauPrologRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
function buildContext(runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory: "sessions/test-session/source",
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "main.r",
        programArguments: [],
        languageIdentifier: "r",
    };
}
async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await stat(targetPath);
        return true;
    } catch {
        return false;
    }
}
describe("WebRRuntimeAssembler", () => {
    test("copies the browser distribution and patches streaming instantiation", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-webr-"));
        try {
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new WebRRuntimeAssembler(new FileSystemOperations());
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            const runtimeRoot = join(runtimeDirectory, "webr");
            for (const fileName of [
                "webr.js",
                "webr-worker.js",
                "R.js",
                "R.wasm",
                "libRblas.so",
                "libRlapack.so",
            ]) {
                expect(await pathExists(join(runtimeRoot, fileName)), fileName).toBe(true);
            }
            expect(await pathExists(join(runtimeRoot, "vfs/etc/ssl/cert.pem"))).toBe(true);
            expect(await pathExists(join(runtimeRoot, "webr.mjs"))).toBe(false);
            const kernelText = await readFile(join(runtimeRoot, "R.js"), "utf8");
            expect(kernelText.includes("WebAssembly.instantiateStreaming(response,imports)")).toBe(
                false,
            );
            expect(kernelText.includes("(await response).arrayBuffer()")).toBe(true);
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
describe("CherryCljsRuntimeAssembler", () => {
    test("copies the browser compiler and its standard library modules", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-cherry-"));
        try {
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new CherryCljsRuntimeAssembler(new FileSystemOperations());
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            const runtimeRoot = join(runtimeDirectory, "clojurescript");
            for (const fileName of [
                "lib/compiler.js",
                "cljs.core.js",
                "lib/cljs.core.js",
                "lib/clojure.string.js",
                "lib/clojure.walk.js",
            ]) {
                expect(await pathExists(join(runtimeRoot, fileName)), fileName).toBe(true);
            }
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
describe("BiwaschemeRuntimeAssembler", () => {
    test("copies the BiwaScheme ESM under a .js name", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-biwa-"));
        try {
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new BiwaschemeRuntimeAssembler(new FileSystemOperations());
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            const runtimePath = join(runtimeDirectory, "scheme/biwascheme.js");
            expect(await pathExists(runtimePath)).toBe(true);
            const runtimeText = await readFile(runtimePath, "utf8");
            expect(runtimeText.includes("export default")).toBe(true);
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
describe("TauPrologRuntimeAssembler", () => {
    test("copies the tau-prolog core and lists modules", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-tau-"));
        try {
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new TauPrologRuntimeAssembler(new FileSystemOperations());
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            for (const fileName of ["modules/core.js", "modules/lists.js"]) {
                expect(await pathExists(join(runtimeDirectory, "prolog", fileName)), fileName).toBe(
                    true,
                );
            }
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
