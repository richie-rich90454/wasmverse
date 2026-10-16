import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { JsclRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/JsclRuntimeAssembler.ts";
import { WaclRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/WaclRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
function buildContext(runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory: "sessions/test-session/source",
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "main.lisp",
        programArguments: [],
        languageIdentifier: "commonlisp",
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
describe("JsclRuntimeAssembler", () => {
    test("copies the vendored jscl.js runtime into the session runtime directory", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-jscl-"));
        try {
            const toolchainDirectory = join(fixtureDirectory, "toolchain");
            await mkdir(toolchainDirectory);
            await writeFile(join(toolchainDirectory, "jscl.js"), "(function(){})();", "utf8");
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new JsclRuntimeAssembler(
                new FileSystemOperations(),
                toolchainDirectory,
            );
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            expect(await pathExists(join(runtimeDirectory, "commonlisp", "jscl.js"))).toBe(true);
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("fails with a setup hint when the runtime is not vendored", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-jscl-missing-"));
        try {
            const assembler = new JsclRuntimeAssembler(
                new FileSystemOperations(),
                join(fixtureDirectory, "missing"),
            );
            await expect(
                assembler.assembleRuntimeInto(buildContext(join(fixtureDirectory, "runtime"))),
            ).rejects.toThrow("Run pnpm run setup.");
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
describe("WaclRuntimeAssembler", () => {
    test("copies every wacl runtime artifact into the session runtime directory", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-wacl-"));
        try {
            const toolchainDirectory = join(fixtureDirectory, "toolchain");
            await mkdir(toolchainDirectory);
            for (const fileName of [
                "wacl.js",
                "wacl.wasm",
                "wacl-library.data",
                "wacl-custom.data",
            ]) {
                await writeFile(join(toolchainDirectory, fileName), `content of ${fileName}`);
            }
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const assembler = new WaclRuntimeAssembler(
                new FileSystemOperations(),
                toolchainDirectory,
            );
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            for (const fileName of [
                "wacl.js",
                "wacl.wasm",
                "wacl-library.data",
                "wacl-custom.data",
            ]) {
                expect(await pathExists(join(runtimeDirectory, "tcl", fileName)), fileName).toBe(
                    true,
                );
            }
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("fails with a setup hint when an artifact is missing", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-wacl-missing-"));
        try {
            const toolchainDirectory = join(fixtureDirectory, "toolchain");
            await mkdir(toolchainDirectory);
            await writeFile(join(toolchainDirectory, "wacl.js"), "(() => {})();");
            const assembler = new WaclRuntimeAssembler(
                new FileSystemOperations(),
                toolchainDirectory,
            );
            await expect(
                assembler.assembleRuntimeInto(buildContext(join(fixtureDirectory, "runtime"))),
            ).rejects.toThrow("Run pnpm run setup.");
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
