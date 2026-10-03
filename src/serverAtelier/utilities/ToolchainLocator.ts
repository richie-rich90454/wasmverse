import { resolve } from "node:path";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const WINDOWS_EXECUTABLE_SUFFIXES = [".exe", ".cmd", ".bat"] as const;
const POSIX_EXECUTABLE_SUFFIXES = [""] as const;
const IS_WINDOWS = process.platform === "win32";
/**
 * Finds a toolchain binary by trying the platform's executable spellings of one
 * name, then falling back to whatever is on `PATH`. Strategies use this instead
 * of hardcoding `bin/tool`, which never resolves on Windows where the binary is
 * `bin/tool.exe`.
 *
 * Resolved paths are made absolute because compilers run with the session source
 * directory as their working directory, where a relative `./.tools/...` path
 * would not point at the toolchain.
 */
class ToolchainLocator {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async resolveExistingPath(basePath: string): Promise<string | undefined> {
        const absoluteBasePath = resolve(basePath);
        for (const suffix of ToolchainLocator.executableSuffixes()) {
            const candidate = `${absoluteBasePath}${suffix}`;
            if (await this.fileSystemOperations.pathExists(candidate)) {
                return candidate;
            }
        }
        return undefined;
    }
    /**
     * Returns the local binary when it is provisioned and the bare command name
     * otherwise, so a toolchain installed on `PATH` is used without configuration.
     *
     * The result is an argument vector, not a single string, because `Bun.spawn`
     * cannot launch a Windows `.bat` or `.cmd` launcher directly. Kotlin ships only
     * `kotlinc-wasm.bat`, and spawning it by path fails with ENOENT, so such a
     * launcher is invoked through the command interpreter instead.
     */
    async resolveCommandVector(
        basePath: string,
        pathCommandName: string,
        toolchainName: string,
    ): Promise<Array<string>> {
        const resolvedPath = await this.resolveExistingPath(basePath);
        if (!resolvedPath) {
            if (await this.isOnPath(pathCommandName)) {
                return [pathCommandName];
            }
            // Falling through to the bare name spawns something that does not
            // exist and surfaces as a raw ENOENT from the process layer, which
            // names no toolchain. Say which toolchain is missing and where it
            // belongs instead.
            throw new Error(
                `${toolchainName} toolchain not found. Run bun run setup, or install ${pathCommandName} on PATH, or place it at ${basePath}.`,
            );
        }
        const lowerCasePath = resolvedPath.toLowerCase();
        const isWindowsLauncherScript =
            IS_WINDOWS && (lowerCasePath.endsWith(".bat") || lowerCasePath.endsWith(".cmd"));
        return isWindowsLauncherScript
            ? ["cmd.exe", "/d", "/s", "/c", resolvedPath]
            : [resolvedPath];
    }
    /**
     * On Windows an extensionless sibling is a POSIX shell script that cannot be
     * executed at all, and Kotlin ships one next to its launcher. So only the real
     * Windows executable spellings are considered, native first.
     */
    private static executableSuffixes(): ReadonlyArray<string> {
        return IS_WINDOWS ? WINDOWS_EXECUTABLE_SUFFIXES : POSIX_EXECUTABLE_SUFFIXES;
    }
    private async isOnPath(commandName: string): Promise<boolean> {
        try {
            const probe = Bun.spawn([IS_WINDOWS ? "where" : "which", commandName], {
                stdout: "pipe",
                stderr: "pipe",
            });
            return (await probe.exited) === 0;
        } catch {
            return false;
        }
    }
}
export { ToolchainLocator };
