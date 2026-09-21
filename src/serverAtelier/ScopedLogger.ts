class ScopedLogger {
    private readonly scopeName: string;
    constructor(scopeName: string) {
        this.scopeName = scopeName;
    }
    logInformation(message: string): void {
        console.log(`\x1b[36m[${this.scopeName}]\x1b[0m ${message}`);
    }
    logSuccess(message: string): void {
        console.log(`\x1b[32m[${this.scopeName}]\x1b[0m ${message}`);
    }
    logWarning(message: string): void {
        console.warn(`\x1b[33m[${this.scopeName}]\x1b[0m ${message}`);
    }
    logError(message: string): void {
        console.error(`\x1b[31m[${this.scopeName}]\x1b[0m ${message}`);
    }
    logDebug(message: string): void {
        if (process.env.DEBUG) {
            console.debug(`\x1b[90m[${this.scopeName}]\x1b[0m ${message}`);
        }
    }
}
export { ScopedLogger };
