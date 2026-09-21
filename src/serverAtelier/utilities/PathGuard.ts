import { relative, resolve, sep } from "node:path";
class PathGuard {
    assertInsideBaseDirectory(candidatePath: string, baseDirectory: string): void {
        const resolvedBase = resolve(baseDirectory);
        const resolvedCandidate = resolve(resolvedBase, candidatePath);
        const relativePath = relative(resolvedBase, resolvedCandidate);
        const escapesBase = relativePath === ".." || relativePath.startsWith(`..${sep}`);
        if (escapesBase) {
            throw new Error(`Path ${candidatePath} escapes base directory ${baseDirectory}.`);
        }
    }
    resolveInsideBaseDirectory(candidatePath: string, baseDirectory: string): string {
        this.assertInsideBaseDirectory(candidatePath, baseDirectory);
        return resolve(resolve(baseDirectory), candidatePath);
    }
}
export { PathGuard };
