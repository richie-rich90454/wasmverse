import { describe, expect, test } from "bun:test";
import { ToolchainLocator } from "@serverAtelier/utilities/ToolchainLocator.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const IS_WINDOWS = process.platform === "win32";
const WINDOWS_SUFFIX = ".exe";
const UNIX_SUFFIX = "";
function platformSuffix(): string {
    return IS_WINDOWS ? WINDOWS_SUFFIX : UNIX_SUFFIX;
}
async function createFixtureDirectory(name: string): Promise<string> {
    const directory = join(tmpdir(), `wasmverse-toolchain-probe-${name}`);
    await new FileSystemOperations().removeRecursively(directory);
    await new FileSystemOperations().ensureDirectoryExists(directory);
    return directory;
}
describe("ToolchainLocator", () => {
    test("resolves a bare path on this platform", async () => {
        const directory = await createFixtureDirectory("bare");
        const toolchainLocator = new ToolchainLocator(new FileSystemOperations());
        const toolPath = `${directory}/compiler${platformSuffix()}`;
        await Bun.write(toolPath, "");
        // `resolve` normalises separators, so compare against the normalised path.
        expect(await toolchainLocator.resolveExistingPath(`${directory}/compiler`)).toBe(
            resolve(toolPath),
        );
        await new FileSystemOperations().removeRecursively(directory);
    });
    test("a missing toolchain throws a message naming the toolchain", async () => {
        const directory = await createFixtureDirectory("absent");
        const toolchainLocator = new ToolchainLocator(new FileSystemOperations());
        const resolution = toolchainLocator.resolveCommandVector(
            `${directory}/nothing-here`,
            "definitely-not-a-real-binary-xyz",
            "Nonexistent",
        );
        await expect(resolution).rejects.toThrow(/Nonexistent toolchain not found/);
        await new FileSystemOperations().removeRecursively(directory);
    });
});
