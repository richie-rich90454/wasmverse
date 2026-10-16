import { resolve } from "node:path";
import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class SessionLifecycleRecord {
    readonly sessionIdentifier: string;
    readonly languageIdentifier: LanguageIdentifier;
    entryFileRelativePath: string;
    readonly programArguments: ReadonlyArray<string>;
    readonly creationTimestamp: number;
    readonly sessionDirectory: string;
    readonly sourceDirectory: string;
    readonly runtimeDirectory: string;
    readonly userCodeDirectory: string;
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(
        sessionIdentifier: string,
        languageIdentifier: LanguageIdentifier,
        entryFileRelativePath: string,
        programArguments: ReadonlyArray<string>,
        sessionsDirectory: string,
        fileSystemOperations: FileSystemOperations,
    ) {
        this.sessionIdentifier = sessionIdentifier;
        this.languageIdentifier = languageIdentifier;
        this.entryFileRelativePath = entryFileRelativePath;
        this.programArguments = programArguments;
        this.creationTimestamp = Date.now();
        this.sessionDirectory = `${resolve(sessionsDirectory)}/${sessionIdentifier}`;
        this.sourceDirectory = `${this.sessionDirectory}/source`;
        this.runtimeDirectory = `${this.sessionDirectory}/dist/runtime`;
        this.userCodeDirectory = `${this.sessionDirectory}/dist/user-code`;
        this.fileSystemOperations = fileSystemOperations;
    }
    assignEntryFile(entryFileRelativePath: string): void {
        this.entryFileRelativePath = entryFileRelativePath;
    }
    isExpiredAfter(timeToLiveMilliseconds: number): boolean {
        return Date.now() - this.creationTimestamp > timeToLiveMilliseconds;
    }
    convertToDescriptor(): SessionDescriptorRecord {
        return {
            sessionIdentifier: this.sessionIdentifier,
            languageIdentifier: this.languageIdentifier,
            entryFileRelativePath: this.entryFileRelativePath,
            programArguments: this.programArguments,
            creationTimestamp: this.creationTimestamp,
        };
    }
    async destroy(): Promise<void> {
        await this.fileSystemOperations.removeRecursively(this.sessionDirectory);
    }
}
export { SessionLifecycleRecord };
