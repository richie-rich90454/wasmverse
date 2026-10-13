interface UserManifestRecord {
    entryFileRelativePath: string;
    includedFileRelativePaths: ReadonlyArray<string>;
    programArguments: ReadonlyArray<string>;
    runtimeType: string;
}
export type { UserManifestRecord };
