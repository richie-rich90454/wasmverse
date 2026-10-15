import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { unzipSync } from "fflate";
import { afterAll, expect, test } from "vitest";
import { ServerComposition } from "@serverAtelier/ServerComposition.ts";
import { callTool, createToolHandlerMap } from "./WasmverseMcpServer.ts";
const temporaryDirectories: Array<string> = [];
async function createTemporaryDirectory(prefix: string): Promise<string> {
    const directoryPath = await mkdtemp(join(tmpdir(), prefix));
    temporaryDirectories.push(directoryPath);
    return directoryPath;
}
const testSessionsDirectory = await createTemporaryDirectory("wasmverse-mcp-test-sessions-");
process.env["SESSIONS_DIRECTORY"] = testSessionsDirectory;
const testArtifactsDirectory = await createTemporaryDirectory("wasmverse-mcp-test-artifacts-");
const composition = new ServerComposition();
const toolHandlerMap = createToolHandlerMap(composition);
function readToolText(result: CallToolResult): string {
    const firstContent = result.content[0];
    if (!firstContent || firstContent.type !== "text") {
        throw new Error("Expected text content in the tool result.");
    }
    return firstContent.text;
}
afterAll(async () => {
    for (const temporaryDirectory of temporaryDirectories) {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
});
test("list_languages reports identifiers, display names, and entry extensions", async () => {
    const result = await callTool(toolHandlerMap, "list_languages", {});
    expect(result.isError).toBeFalsy();
    const languages = JSON.parse(readToolText(result)) as Array<{
        languageIdentifier: string;
        displayName: string;
        entryFileExtensions: Array<string>;
    }>;
    expect(languages.length).toBeGreaterThan(50);
    const pythonEntry = languages.find((language) => language.languageIdentifier === "python");
    expect(pythonEntry).toEqual({
        languageIdentifier: "python",
        displayName: "Python",
        entryFileExtensions: [".py"],
    });
});
test("build_session compiles inline python and export_artifact writes a runnable zip", async () => {
    const buildResult = await callTool(toolHandlerMap, "build_session", {
        files: { "main.py": "print('hello from the wasmverse mcp server')\n" },
        entry: "main.py",
    });
    expect(buildResult.isError).toBeFalsy();
    const descriptor = JSON.parse(readToolText(buildResult)) as {
        sessionIdentifier: string;
        languageIdentifier: string;
        entryFileRelativePath: string;
    };
    expect(descriptor.languageIdentifier).toBe("python");
    expect(descriptor.entryFileRelativePath).toBe("main.py");
    expect(descriptor.sessionIdentifier.length).toBeGreaterThan(0);
    const artifactPath = join(testArtifactsDirectory, `${descriptor.sessionIdentifier}.zip`);
    const exportResult = await callTool(toolHandlerMap, "export_artifact", {
        sessionIdentifier: descriptor.sessionIdentifier,
        format: "zip",
        outputPath: artifactPath,
    });
    expect(exportResult.isError).toBeFalsy();
    const artifact = JSON.parse(readToolText(exportResult)) as {
        artifactPath: string;
        byteSize: number;
        format: string;
    };
    expect(artifact.artifactPath).toBe(artifactPath);
    expect(artifact.format).toBe("zip");
    const artifactBytes = new Uint8Array(await readFile(artifactPath));
    expect(artifact.byteSize).toBe(artifactBytes.byteLength);
    expect(artifactBytes.byteLength).toBeGreaterThan(0);
    const zipEntryNames = Object.keys(unzipSync(artifactBytes));
    for (const expectedEntry of [
        "index.html",
        "app.js",
        "terminal.css",
        "session.json",
        ".nojekyll",
        "runtime/pyodide.asm.wasm",
        "user-code/main.py",
    ]) {
        expect(zipEntryNames).toContain(expectedEntry);
    }
    const releaseResult = await callTool(toolHandlerMap, "export_artifact", {
        sessionIdentifier: descriptor.sessionIdentifier,
    });
    expect(releaseResult.isError).toBe(true);
    expect(readToolText(releaseResult)).toContain("Unknown session");
}, 240_000);
test("export_project builds and exports a project directory in one call", async () => {
    const projectDirectory = await createTemporaryDirectory("wasmverse-mcp-project-");
    await writeFile(join(projectDirectory, "main.py"), "print('exported from a directory')\n");
    const artifactPath = join(testArtifactsDirectory, "export-project.zip");
    const result = await callTool(toolHandlerMap, "export_project", {
        directoryPath: projectDirectory,
        entry: "main.py",
        outputPath: artifactPath,
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(readToolText(result)) as {
        artifactPath: string;
        byteSize: number;
        languageIdentifier: string;
        entryFileRelativePath: string;
    };
    expect(payload.artifactPath).toBe(artifactPath);
    expect(payload.languageIdentifier).toBe("python");
    expect(payload.entryFileRelativePath).toBe("main.py");
    const artifactBytes = new Uint8Array(await readFile(artifactPath));
    expect(payload.byteSize).toBe(artifactBytes.byteLength);
    expect(Object.keys(unzipSync(artifactBytes))).toContain("index.html");
}, 240_000);
test("error paths return readable isError results", async () => {
    const badEntry = await callTool(toolHandlerMap, "build_session", {
        files: { "main.py": "print('x')\n" },
        entry: "nope.py",
    });
    expect(badEntry.isError).toBe(true);
    expect(readToolText(badEntry)).toContain("nope.py not found in archive");
    const missingInput = await callTool(toolHandlerMap, "build_session", {});
    expect(missingInput.isError).toBe(true);
    expect(readToolText(missingInput)).toContain('Provide "files" or "directoryPath"');
    const unknownSession = await callTool(toolHandlerMap, "export_artifact", {
        sessionIdentifier: "no-such-session",
    });
    expect(unknownSession.isError).toBe(true);
    expect(readToolText(unknownSession)).toContain("Unknown session");
    const htmlFormat = await callTool(toolHandlerMap, "export_artifact", {
        sessionIdentifier: "any-session",
        format: "html",
    });
    expect(htmlFormat.isError).toBe(true);
    expect(readToolText(htmlFormat)).toContain("not available in this build");
    const unknownTool = await callTool(toolHandlerMap, "no_such_tool", {});
    expect(unknownTool.isError).toBe(true);
    expect(readToolText(unknownTool)).toContain("Unknown tool");
    const unknownLanguage = await callTool(toolHandlerMap, "build_session", {
        files: { "main.xyz": "x" },
        entry: "main.xyz",
    });
    expect(unknownLanguage.isError).toBe(true);
    expect(readToolText(unknownLanguage)).toContain("Cannot determine language");
});
