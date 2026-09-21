import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { BuildOutcomeRecord } from "@sharedKernel/BuildOutcomeRecord.ts";
import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
interface LanguagePluginContract {
    readonly languageIdentifier: LanguageIdentifier;
    readonly displayName: string;
    readonly supportedFileExtensions: ReadonlyArray<string>;
    buildIntoSession(context: BuildContextRecord): Promise<BuildOutcomeRecord>;
}
export type { LanguagePluginContract };
