import type { Terminal } from "@xterm/xterm";
class TerminalSelectionCopier {
    private terminalInstance: Terminal | undefined;
    attachTerminal(terminal: Terminal, container: HTMLElement): void {
        this.terminalInstance = terminal;
        container.addEventListener("contextmenu", (event: MouseEvent) => {
            void this.handleContextMenu(event);
        });
        terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
            const isCopyModifier = event.ctrlKey || event.metaKey;
            const isPlainCopy = isCopyModifier && !event.shiftKey && event.key.toLowerCase() === "c";
            const isShiftCopy = isCopyModifier && event.shiftKey && event.key.toLowerCase() === "c";
            if ((isPlainCopy || isShiftCopy) && this.hasSelection()) {
                void this.copySelection();
                return false;
            }
            return true;
        });
    }
    hasSelection(): boolean {
        return (this.terminalInstance?.getSelection() ?? "").length > 0;
    }
    async copySelection(): Promise<boolean> {
        const selection = this.terminalInstance?.getSelection() ?? "";
        if (!selection) {
            return false;
        }
        try {
            await navigator.clipboard.writeText(selection);
            return true;
        } catch {
            return this.fallbackCopy(selection);
        }
    }
    async pasteFromClipboard(insertText: (text: string) => void): Promise<void> {
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText) {
                insertText(clipboardText);
            }
        } catch {
            return;
        }
    }
    private async handleContextMenu(event: MouseEvent): Promise<void> {
        if (this.hasSelection()) {
            event.preventDefault();
            await this.copySelection();
        }
    }
    private fallbackCopy(text: string): boolean {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.select();
            const copied = document.execCommand("copy");
            document.body.removeChild(textArea);
            return copied;
        } catch {
            return false;
        }
    }
}
export { TerminalSelectionCopier };
