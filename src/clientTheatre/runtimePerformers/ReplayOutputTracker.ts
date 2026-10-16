import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
class ReplayOutputTracker {
    private shownText: string = "";
    private runBuffer: string = "";
    private textDecoder: TextDecoder = new TextDecoder();
    beginRun(): void {
        this.runBuffer = "";
    }
    appendBytes(bytes: Uint8Array): void {
        this.runBuffer += this.textDecoder.decode(bytes, { stream: true });
    }
    appendText(text: string): void {
        this.runBuffer += text;
    }
    flushShownInto(stage: TerminalStageController): void {
        const sharedPrefixLength = this.commonPrefixLength(this.shownText, this.runBuffer);
        const newText = this.runBuffer.slice(sharedPrefixLength);
        this.shownText += newText;
        if (newText) {
            stage.writeText(newText);
        }
    }
    private commonPrefixLength(first: string, second: string): number {
        const shortestLength = Math.min(first.length, second.length);
        let sharedLength = 0;
        while (sharedLength < shortestLength && first[sharedLength] === second[sharedLength]) {
            sharedLength++;
        }
        return sharedLength;
    }
}
export { ReplayOutputTracker };
