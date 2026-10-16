import { Fd, wasi } from "@bjorn3/browser_wasi_shim";
const TERMINAL_INPUT_MARKER = "TERMINAL_INPUT_NEEDED";
class TerminalInputNeededSignal extends Error {
    constructor() {
        super(TERMINAL_INPUT_MARKER);
        this.name = "TerminalInputNeededSignal";
    }
}
function isTerminalInputNeeded(candidate: unknown): boolean {
    if (candidate instanceof TerminalInputNeededSignal) {
        return true;
    }
    const message = candidate instanceof Error ? candidate.message : String(candidate);
    return message.includes(TERMINAL_INPUT_MARKER);
}
class ReplayableStdinFile extends Fd {
    private fedChunks: Array<Uint8Array> = [];
    private chunkHead: number = 0;
    private headOffset: number = 0;
    private fedLength: number = 0;
    private consumedLength: number = 0;
    feedLine(line: string): void {
        const encoded = new TextEncoder().encode(line + "\n");
        this.fedChunks.push(encoded);
        this.fedLength += encoded.length;
    }
    override fd_fdstat_get(): { ret: number; fdstat: wasi.Fdstat | null } {
        return { ret: 0, fdstat: new wasi.Fdstat(wasi.FILETYPE_CHARACTER_DEVICE, 0) };
    }
    override fd_pread(size: number, _offset: bigint): { ret: number; data: Uint8Array } {
        return this.fd_read(size);
    }
    override fd_read(size: number): { ret: number; data: Uint8Array } {
        const availableLength = this.fedLength - this.consumedLength;
        if (availableLength <= 0) {
            throw new TerminalInputNeededSignal();
        }
        const takeLength = Math.min(Number(size), availableLength);
        const result = new Uint8Array(takeLength);
        let filledLength = 0;
        while (filledLength < takeLength) {
            const headChunk = this.fedChunks[this.chunkHead] as Uint8Array;
            const chunkAvailable = headChunk.length - this.headOffset;
            const copyLength = Math.min(chunkAvailable, takeLength - filledLength);
            result.set(
                headChunk.subarray(this.headOffset, this.headOffset + copyLength),
                filledLength,
            );
            filledLength += copyLength;
            this.headOffset += copyLength;
            this.consumedLength += copyLength;
            if (this.headOffset >= headChunk.length) {
                this.chunkHead++;
                this.headOffset = 0;
            }
        }
        return { ret: 0, data: result };
    }
}
export { ReplayableStdinFile, TerminalInputNeededSignal, isTerminalInputNeeded };
