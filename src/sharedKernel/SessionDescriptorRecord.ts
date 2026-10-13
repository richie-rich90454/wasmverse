import type { LanguageIdentifier } from "./LanguageIdentifier.ts";
interface SessionDescriptorRecord {
    sessionIdentifier: string;
    languageIdentifier: LanguageIdentifier;
    entryFileRelativePath: string;
    programArguments: ReadonlyArray<string>;
    creationTimestamp: number;
}
export type { SessionDescriptorRecord };
