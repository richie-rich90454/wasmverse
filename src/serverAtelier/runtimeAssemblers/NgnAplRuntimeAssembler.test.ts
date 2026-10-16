import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { NgnAplRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/NgnAplRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const FIXTURE_RUNTIME_TEXT = [
    "'use strict'",
    "let apl=this.apl=(s,o)=>apl.ws(o)(s) // s:apl code; o:options",
    "console.log('unused line without anchors')",
    "  if(o.in )ctx['get_Q']=_=>{let s=o.in();asrt(typeof s==='string');return new A(s)}",
    "if(typeof module!=='undefined'){module.exports=apl}",
    "",
].join("\n");
function buildContext(runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory: "sessions/test-session/source",
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "main.apl",
        programArguments: [],
        languageIdentifier: "apl",
    };
}
describe("NgnAplRuntimeAssembler", () => {
    test("patches the archived interpreter into a browser ES module", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-ngnapl-"));
        try {
            const packageDirectory = join(fixtureDirectory, "ngn-apl");
            const runtimeDirectory = join(fixtureDirectory, "runtime");
            const fileSystemOperations = new FileSystemOperations();
            await fileSystemOperations.ensureDirectoryExists(packageDirectory);
            await writeFile(join(packageDirectory, "apl.js"), FIXTURE_RUNTIME_TEXT);
            const assembler = new NgnAplRuntimeAssembler(fileSystemOperations, packageDirectory);
            await assembler.assembleRuntimeInto(buildContext(runtimeDirectory));
            const runtimeText = await readFile(join(runtimeDirectory, "ngn-apl/apl.js"), "utf8");
            expect(runtimeText.includes("let apl=globalThis.apl=")).toBe(true);
            expect(runtimeText.includes("let apl=this.apl=")).toBe(false);
            expect(runtimeText.includes("return A(s.split(''),s.length===1?[]:[s.length])}")).toBe(
                true,
            );
            expect(runtimeText.includes("return new A(s)}")).toBe(false);
            expect(runtimeText.includes("export default globalThis.apl;")).toBe(true);
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("fails clearly when the vendored runtime is missing", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-ngnapl-missing-"));
        try {
            const assembler = new NgnAplRuntimeAssembler(
                new FileSystemOperations(),
                join(fixtureDirectory, "ngn-apl"),
            );
            await expect(
                assembler.assembleRuntimeInto(buildContext(join(fixtureDirectory, "runtime"))),
            ).rejects.toThrow("Run pnpm run setup");
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("fails clearly when the archived interpreter changes shape", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-ngnapl-shape-"));
        try {
            const packageDirectory = join(fixtureDirectory, "ngn-apl");
            const fileSystemOperations = new FileSystemOperations();
            await fileSystemOperations.ensureDirectoryExists(packageDirectory);
            await writeFile(join(packageDirectory, "apl.js"), "'use strict'\nconst apl=1;\n");
            const assembler = new NgnAplRuntimeAssembler(fileSystemOperations, packageDirectory);
            await expect(
                assembler.assembleRuntimeInto(buildContext(join(fixtureDirectory, "runtime"))),
            ).rejects.toThrow("recheck the runtime patch");
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
