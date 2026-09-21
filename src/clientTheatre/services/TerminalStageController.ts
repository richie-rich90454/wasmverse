import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
class TerminalStageController {
    private terminalInstance: Terminal | undefined;
    private fitAddonInstance: FitAddon | undefined;
    private inputBuffer: string = "";
    private pendingReadResolver: ((line: string) => void) | undefined;
    private mountPromise: Promise<void>;
    private mountResolver: (() => void) | undefined;
    constructor() {
        this.mountPromise = new Promise<void>((resolve) => {
            this.mountResolver = resolve;
        });
    }
    async whenMounted(): Promise<void> {
        await this.mountPromise;
    }
    mountInto(container: HTMLElement): void {
        this.terminalInstance = new Terminal({
            fontFamily: 'Menlo, Consolas, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.45,
            theme: { background: "#0D0D0D", foreground: "#E8E5DD", cursor: "#7AA8D0" },
        });
        this.fitAddonInstance = new FitAddon();
        this.terminalInstance.loadAddon(this.fitAddonInstance);
        this.terminalInstance.open(container);
        this.fitAddonInstance.fit();
        this.terminalInstance.onData((data: string) => this.handleTerminalData(data));
        this.mountResolver?.();
        this.mountResolver = undefined;
    }
    writeText(text: string): void {
        this.terminalInstance?.write(text);
    }
    writeLine(text: string): void {
        this.terminalInstance?.writeln(text);
    }
    readLine(promptText: string): Promise<string> {
        this.writeText(promptText);
        return new Promise<string>((resolve) => {
            this.pendingReadResolver = resolve;
        });
    }
    clearScreen(): void {
        this.terminalInstance?.clear();
    }
    focusStage(): void {
        this.terminalInstance?.focus();
    }
    refitToContainer(): void {
        this.fitAddonInstance?.fit();
    }
    dispose(): void {
        this.terminalInstance?.dispose();
        this.terminalInstance = undefined;
        this.fitAddonInstance = undefined;
    }
    private handleTerminalData(data: string): void {
        if (!this.pendingReadResolver) {
            return;
        }
        if (data === "\r" || data === "\n") {
            this.writeText("\r\n");
            const completedLine = this.inputBuffer;
            this.inputBuffer = "";
            const resolver = this.pendingReadResolver;
            this.pendingReadResolver = undefined;
            resolver(completedLine);
        } else if (data === "\u007f") {
            if (this.inputBuffer.length > 0) {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this.writeText("\b \b");
            }
        } else if (data === "\u0003") {
            this.inputBuffer = "";
            this.writeText("^C\r\n");
            const resolver = this.pendingReadResolver;
            this.pendingReadResolver = undefined;
            resolver("");
        } else if (data.length >= 2 && data.startsWith("\u001b")) {
            return;
        } else {
            this.inputBuffer += data;
            this.writeText(data);
        }
    }
}
export { TerminalStageController };
