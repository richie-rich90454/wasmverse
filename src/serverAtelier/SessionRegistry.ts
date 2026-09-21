import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import { SessionLifecycleRecord } from "@serverAtelier/SessionLifecycleRecord.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { IdentifierGenerator } from "@serverAtelier/utilities/IdentifierGenerator.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
class SessionRegistry {
    private readonly sessionsByIdentifier: Map<string, SessionLifecycleRecord>;
    private readonly sessionsDirectory: string;
    private readonly sessionTimeToLiveMilliseconds: number;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly identifierGenerator: IdentifierGenerator;
    private readonly scopedLogger: ScopedLogger;
    constructor(
        sessionsDirectory: string,
        sessionTimeToLiveMilliseconds: number,
        fileSystemOperations: FileSystemOperations,
        identifierGenerator: IdentifierGenerator,
        scopedLogger: ScopedLogger,
    ) {
        this.sessionsByIdentifier = new Map();
        this.sessionsDirectory = sessionsDirectory;
        this.sessionTimeToLiveMilliseconds = sessionTimeToLiveMilliseconds;
        this.fileSystemOperations = fileSystemOperations;
        this.identifierGenerator = identifierGenerator;
        this.scopedLogger = scopedLogger;
        const reaperInterval = setInterval(() => {
            void this.reapExpiredSessions();
        }, 60_000);
        reaperInterval.unref?.();
    }
    async allocateSession(
        languageIdentifier: LanguageIdentifier,
        entryFileRelativePath: string,
    ): Promise<SessionLifecycleRecord> {
        const sessionIdentifier = this.identifierGenerator.generateSessionIdentifier();
        const sessionRecord = new SessionLifecycleRecord(
            sessionIdentifier,
            languageIdentifier,
            entryFileRelativePath,
            this.sessionsDirectory,
            this.fileSystemOperations,
        );
        await this.fileSystemOperations.ensureDirectoryExists(sessionRecord.sourceDirectory);
        await this.fileSystemOperations.ensureDirectoryExists(sessionRecord.runtimeDirectory);
        await this.fileSystemOperations.ensureDirectoryExists(sessionRecord.userCodeDirectory);
        this.sessionsByIdentifier.set(sessionIdentifier, sessionRecord);
        return sessionRecord;
    }
    findByIdentifier(sessionIdentifier: string): SessionLifecycleRecord | undefined {
        return this.sessionsByIdentifier.get(sessionIdentifier);
    }
    async releaseSession(sessionIdentifier: string): Promise<void> {
        const sessionRecord = this.sessionsByIdentifier.get(sessionIdentifier);
        if (!sessionRecord) {
            return;
        }
        this.sessionsByIdentifier.delete(sessionIdentifier);
        await sessionRecord.destroy();
    }
    async reapExpiredSessions(): Promise<void> {
        for (const [sessionIdentifier, sessionRecord] of this.sessionsByIdentifier) {
            if (sessionRecord.isExpiredAfter(this.sessionTimeToLiveMilliseconds)) {
                this.scopedLogger.logInformation(`Reaping expired session ${sessionIdentifier}.`);
                await this.releaseSession(sessionIdentifier);
            }
        }
    }
}
export { SessionRegistry };
