import type { UserManifestRecord } from "./UserManifestRecord.ts";
interface BuildOutcomeRecord {
    runtimeDirectory: string;
    userCodeDirectory: string;
    entryFileRelativePath: string;
    manifest: UserManifestRecord;
}
export type { BuildOutcomeRecord };
