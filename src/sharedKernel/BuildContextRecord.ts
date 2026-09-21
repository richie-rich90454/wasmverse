import type { LanguageIdentifier } from "./LanguageIdentifier.ts";
interface BuildContextRecord {
    sessionIdentifier: string;
    sessionDirectory: string;
    sourceDirectory: string;
    runtimeDirectory: string;
    userCodeDirectory: string;
    entryFileRelativePath: string;
    languageIdentifier: LanguageIdentifier;
}
export type { BuildContextRecord };
