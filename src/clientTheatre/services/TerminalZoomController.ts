import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
class TerminalZoomController {
    private terminalInstance: Terminal | undefined;
    private fitAddonInstance: FitAddon | undefined;
    private fontSizePoints: number = 13;
    private readonly minimumFontSize: number = 9;
    private readonly maximumFontSize: number = 28;
    attachTerminal(terminal: Terminal, fitAddon: FitAddon, container: HTMLElement): void {
        this.terminalInstance = terminal;
        this.fitAddonInstance = fitAddon;
        container.addEventListener("keydown", (event: KeyboardEvent) => {
            this.handleKeyDown(event);
        });
        container.addEventListener(
            "wheel",
            (event: WheelEvent) => {
                this.handleWheel(event);
            },
            { passive: false },
        );
    }
    zoomIn(): void {
        this.applyFontSize(this.fontSizePoints + 1);
    }
    zoomOut(): void {
        this.applyFontSize(this.fontSizePoints - 1);
    }
    resetZoom(): void {
        this.applyFontSize(13);
    }
    private applyFontSize(nextSize: number): void {
        const clampedSize = Math.min(
            this.maximumFontSize,
            Math.max(this.minimumFontSize, nextSize),
        );
        if (clampedSize === this.fontSizePoints) {
            return;
        }
        this.fontSizePoints = clampedSize;
        if (this.terminalInstance) {
            this.terminalInstance.options.fontSize = clampedSize;
        }
        this.fitAddonInstance?.fit();
    }
    private handleKeyDown(event: KeyboardEvent): void {
        if (!(event.ctrlKey || event.metaKey) || event.shiftKey) {
            return;
        }
        if (event.key === "=" || event.key === "+") {
            event.preventDefault();
            this.zoomIn();
        } else if (event.key === "-") {
            event.preventDefault();
            this.zoomOut();
        } else if (event.key === "0") {
            event.preventDefault();
            this.resetZoom();
        }
    }
    private handleWheel(event: WheelEvent): void {
        if (!(event.ctrlKey || event.metaKey)) {
            return;
        }
        event.preventDefault();
        if (event.deltaY < 0) {
            this.zoomIn();
        } else if (event.deltaY > 0) {
            this.zoomOut();
        }
    }
}
export { TerminalZoomController };
