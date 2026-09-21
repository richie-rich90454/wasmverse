import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { LanguageIdentifierResolver } from "@serverAtelier/LanguageIdentifierResolver.ts";
import { SessionRegistry } from "@serverAtelier/SessionRegistry.ts";
import { ZipArchiveExtractor } from "@serverAtelier/ZipArchiveExtractor.ts";
import { LanguagePluginRegistry } from "@serverAtelier/pluginHost/LanguagePluginRegistry.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
class BuildOrchestrator {
    private readonly languageIdentifierResolver: LanguageIdentifierResolver;
    private readonly sessionRegistry: SessionRegistry;
    private readonly zipArchiveExtractor: ZipArchiveExtractor;
    private readonly languagePluginRegistry: LanguagePluginRegistry;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly scopedLogger: ScopedLogger;
    constructor(
        languageIdentifierResolver: LanguageIdentifierResolver,
        sessionRegistry: SessionRegistry,
        zipArchiveExtractor: ZipArchiveExtractor,
        languagePluginRegistry: LanguagePluginRegistry,
        fileSystemOperations: FileSystemOperations,
        scopedLogger: ScopedLogger,
    ) {
        this.languageIdentifierResolver = languageIdentifierResolver;
        this.sessionRegistry = sessionRegistry;
        this.zipArchiveExtractor = zipArchiveExtractor;
        this.languagePluginRegistry = languagePluginRegistry;
        this.fileSystemOperations = fileSystemOperations;
        this.scopedLogger = scopedLogger;
    }
    async produceBuildOutcome(
        zipBuffer: Uint8Array,
        entryFileName: string,
    ): Promise<SessionDescriptorRecord> {
        const languageIdentifier =
            this.languageIdentifierResolver.resolveFromFileName(entryFileName);
        const normalizedEntryName = entryFileName.replace(/\\/g, "/").replace(/^\/+/, "");
        const sessionRecord = await this.sessionRegistry.allocateSession(
            languageIdentifier,
            normalizedEntryName,
        );
        try {
            const extraction = await this.zipArchiveExtractor.extractInto(
                zipBuffer,
                sessionRecord.sourceDirectory,
            );
            const resolvedEntryPath = this.resolveEntryFilePath(
                extraction.includedFileRelativePaths,
                normalizedEntryName,
            );
            if (!resolvedEntryPath) {
                throw new Error(
                    `Entry file ${normalizedEntryName} not found in archive. Included files: ${extraction.includedFileRelativePaths.join(", ") || "(none)"}.`,
                );
            }
            const pluginInstance = this.languagePluginRegistry.findByIdentifier(languageIdentifier);
            await pluginInstance.buildIntoSession({
                sessionIdentifier: sessionRecord.sessionIdentifier,
                sessionDirectory: sessionRecord.sessionDirectory,
                sourceDirectory: sessionRecord.sourceDirectory,
                runtimeDirectory: sessionRecord.runtimeDirectory,
                userCodeDirectory: sessionRecord.userCodeDirectory,
                entryFileRelativePath: resolvedEntryPath,
                languageIdentifier,
            });
            this.scopedLogger.logSuccess(
                `Built session ${sessionRecord.sessionIdentifier} (${languageIdentifier}).`,
            );
            return {
                sessionIdentifier: sessionRecord.sessionIdentifier,
                languageIdentifier: sessionRecord.languageIdentifier,
                entryFileRelativePath: resolvedEntryPath,
                creationTimestamp: sessionRecord.creationTimestamp,
            };
        } catch (buildError) {
            await this.sessionRegistry.releaseSession(sessionRecord.sessionIdentifier);
            throw buildError;
        }
    }
    private resolveEntryFilePath(
        includedFileRelativePaths: ReadonlyArray<string>,
        normalizedEntryName: string,
    ): string | undefined {
        const directMatch = includedFileRelativePaths.find((path) => path === normalizedEntryName);
        if (directMatch) {
            return directMatch;
        }
        const entryBaseName = normalizedEntryName.split("/").pop() as string;
        return includedFileRelativePaths.find((path) => {
            const candidateBaseName = path.split("/").pop() as string;
            return candidateBaseName.toLowerCase() === entryBaseName.toLowerCase();
        });
    }
}
export { BuildOrchestrator };
