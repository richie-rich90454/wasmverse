import { strToU8, zipSync } from "fflate";
type ProjectArchiveFileContents = string | Uint8Array;
function packProjectArchive(
    fileContentsByPath: ReadonlyMap<string, ProjectArchiveFileContents>,
): Uint8Array<ArrayBuffer> {
    const zipEntries: Record<string, Uint8Array> = {};
    for (const [relativePath, fileContents] of fileContentsByPath) {
        zipEntries[relativePath] =
            typeof fileContents === "string" ? strToU8(fileContents) : fileContents;
    }
    return zipSync(zipEntries) as Uint8Array<ArrayBuffer>;
}
export { packProjectArchive };
export type { ProjectArchiveFileContents };
