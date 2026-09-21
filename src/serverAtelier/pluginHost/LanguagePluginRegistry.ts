import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { LanguagePluginContract } from "@serverAtelier/pluginHost/LanguagePluginContract.ts";
class LanguagePluginRegistry {
    private readonly pluginsByIdentifier: Map<LanguageIdentifier, LanguagePluginContract>;
    constructor(pluginInstances: ReadonlyArray<LanguagePluginContract>) {
        this.pluginsByIdentifier = new Map();
        for (const pluginInstance of pluginInstances) {
            this.pluginsByIdentifier.set(pluginInstance.languageIdentifier, pluginInstance);
        }
    }
    findByIdentifier(languageIdentifier: LanguageIdentifier): LanguagePluginContract {
        const pluginInstance = this.pluginsByIdentifier.get(languageIdentifier);
        if (!pluginInstance) {
            throw new Error(`No language plugin registered for ${languageIdentifier}.`);
        }
        return pluginInstance;
    }
    findByFileExtension(fileExtension: string): LanguagePluginContract | undefined {
        const lowercasedExtension = fileExtension.toLowerCase();
        for (const pluginInstance of this.pluginsByIdentifier.values()) {
            const matchesExtension = pluginInstance.supportedFileExtensions.some(
                (supportedExtension) => supportedExtension.toLowerCase() === lowercasedExtension,
            );
            if (matchesExtension) {
                return pluginInstance;
            }
        }
        return undefined;
    }
    listAll(): ReadonlyArray<LanguagePluginContract> {
        return [...this.pluginsByIdentifier.values()];
    }
}
export { LanguagePluginRegistry };
