interface UserManifestRecord {
    entryFileRelativePath: string;
    includedFileRelativePaths: ReadonlyArray<string>;
    runtimeType: string;
}
export type { UserManifestRecord };
