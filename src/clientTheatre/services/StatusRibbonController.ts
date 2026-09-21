type StatusRibbonKind = "info" | "ok" | "err";
type StatusRibbonListener = () => void;
class StatusRibbonController {
    messageText: string = "Ready.";
    messageKind: StatusRibbonKind = "info";
    private listeners: Set<StatusRibbonListener> = new Set();
    setMessage(text: string, kind: StatusRibbonKind): void {
        this.messageText = text;
        this.messageKind = kind;
        for (const listener of this.listeners) {
            listener();
        }
    }
    subscribe(listener: StatusRibbonListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
export { StatusRibbonController };
export type { StatusRibbonKind, StatusRibbonListener };
