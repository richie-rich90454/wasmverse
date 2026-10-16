import { describe, expect, test } from "vitest";
import { GoWasmFileSystemShim } from "@clientTheatre/runtimePerformers/GoWasmFileSystemShim.ts";
import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
class RecordingOutputSink {
    readonly chunks: Array<Uint8Array> = [];
    appendBytes(bytes: Uint8Array): void {
        this.chunks.push(bytes.slice());
    }
    get text(): string {
        const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const joinedBytes = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of this.chunks) {
            joinedBytes.set(chunk, offset);
            offset += chunk.length;
        }
        return new TextDecoder().decode(joinedBytes);
    }
}
function captureCall(invoke: (callback: (errorOrNull: unknown, value?: unknown) => void) => void): {
    error: unknown;
    value: unknown;
} {
    let error: unknown = null;
    let value: unknown = undefined;
    invoke((callError: unknown, callValue?: unknown) => {
        error = callError;
        value = callValue;
    });
    return { error, value };
}
function openFile(
    shim: GoWasmFileSystemShim,
    path: string,
    flags: number,
): { descriptor: number; error: unknown } {
    const result = captureCall((callback) => shim.open(path, flags, 0o644, callback));
    return { descriptor: result.value as number, error: result.error };
}
function writeTextToDescriptor(
    shim: GoWasmFileSystemShim,
    descriptor: number,
    text: string,
    position: number | null = null,
): number {
    const bytes = new TextEncoder().encode(text);
    const result = captureCall((callback) =>
        shim.write(descriptor, bytes, 0, bytes.length, position, callback),
    );
    if (result.error) {
        throw result.error as Error;
    }
    return result.value as number;
}
function readBytesFromDescriptor(
    shim: GoWasmFileSystemShim,
    descriptor: number,
    length: number,
    position: number | null = null,
): { bytes: Uint8Array; count: number } {
    const buffer = new Uint8Array(length);
    const result = captureCall((callback) =>
        shim.read(descriptor, buffer, 0, length, position, callback),
    );
    if (result.error) {
        throw result.error as Error;
    }
    const count = result.value as number;
    return { bytes: buffer.slice(0, count), count };
}
function readTextFromDescriptor(
    shim: GoWasmFileSystemShim,
    descriptor: number,
    length: number,
    position: number | null = null,
): { text: string; count: number } {
    const result = readBytesFromDescriptor(shim, descriptor, length, position);
    return { text: new TextDecoder().decode(result.bytes), count: result.count };
}
function writeTextFile(shim: GoWasmFileSystemShim, path: string, text: string): void {
    const { descriptor, error } = openFile(
        shim,
        path,
        shim.constants.O_WRONLY | shim.constants.O_CREAT | shim.constants.O_TRUNC,
    );
    expect(error).toBeNull();
    expect(writeTextToDescriptor(shim, descriptor, text)).toBe(
        new TextEncoder().encode(text).length,
    );
    captureCall((callback) => shim.close(descriptor, callback));
}
function readTextFile(shim: GoWasmFileSystemShim, path: string): string {
    const { descriptor, error } = openFile(shim, path, 0);
    expect(error).toBeNull();
    const collected: Array<string> = [];
    for (;;) {
        const chunk = readTextFromDescriptor(shim, descriptor, 64);
        if (chunk.count === 0) {
            break;
        }
        collected.push(chunk.text);
    }
    captureCall((callback) => shim.close(descriptor, callback));
    return collected.join("");
}
function errorCodeOf(error: unknown): string | undefined {
    return (error as { code?: string } | null)?.code;
}
describe("GoWasmFileSystemShim file operations", () => {
    test("writes and reads a file roundtrip", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        writeTextFile(shim, "/notes.txt", "hello world");
        expect(readTextFile(shim, "/notes.txt")).toBe("hello world");
        const stats = captureCall((callback) => shim.stat("/notes.txt", callback));
        expect((stats.value as { size: number }).size).toBe(11);
        expect((stats.value as { isDirectory(): boolean }).isDirectory()).toBe(false);
    });
    test("returns zero at file end instead of throwing", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        writeTextFile(shim, "/short.txt", "ab");
        const { descriptor } = openFile(shim, "/short.txt", 0);
        expect(readTextFromDescriptor(shim, descriptor, 2).count).toBe(2);
        expect(readTextFromDescriptor(shim, descriptor, 2).count).toBe(0);
        expect(readTextFromDescriptor(shim, descriptor, 2).count).toBe(0);
    });
    test("positional reads do not advance the descriptor position", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        writeTextFile(shim, "/data.bin", "hello world");
        const { descriptor } = openFile(shim, "/data.bin", 0);
        expect(readTextFromDescriptor(shim, descriptor, 5, 6)).toEqual({
            text: "world",
            count: 5,
        });
        expect(readTextFromDescriptor(shim, descriptor, 5).text).toBe("hello");
    });
    test("positional writes overwrite bytes without advancing the descriptor", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        writeTextFile(shim, "/patch.txt", "hello world");
        const { descriptor } = openFile(shim, "/patch.txt", shim.constants.O_RDWR);
        writeTextToDescriptor(shim, descriptor, "XYZ", 2);
        captureCall((callback) => shim.close(descriptor, callback));
        expect(readTextFile(shim, "/patch.txt")).toBe("heXYZ world");
    });
    test("append descriptors write to the end", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        writeTextFile(shim, "/log.txt", "start");
        const { descriptor } = openFile(
            shim,
            "/log.txt",
            shim.constants.O_WRONLY | shim.constants.O_APPEND,
        );
        writeTextToDescriptor(shim, descriptor, "+more");
        captureCall((callback) => shim.close(descriptor, callback));
        expect(readTextFile(shim, "/log.txt")).toBe("start+more");
    });
    test("truncates files to a shorter and longer length", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        writeTextFile(shim, "/cut.txt", "abcdef");
        captureCall((callback) => shim.truncate("/cut.txt", 3, callback));
        expect(readTextFile(shim, "/cut.txt")).toBe("abc");
        captureCall((callback) => shim.truncate("/cut.txt", 5, callback));
        expect(readTextFile(shim, "/cut.txt")).toBe("abc\u0000\u0000");
    });
    test("creates nested directories implicitly when seeding user files", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        shim.seedUserFiles(
            new Map([
                ["main.go", "package main"],
                ["config/notes.txt", "alpha"],
            ]),
        );
        expect(readTextFile(shim, "/config/notes.txt")).toBe("alpha");
        const rootEntries = captureCall((callback) => shim.readdir("/", callback));
        expect([...(rootEntries.value as Array<string>)].sort()).toEqual(["config", "main.go"]);
    });
});
describe("GoWasmFileSystemShim file tree operations", () => {
    test("mkdir, readdir, unlink and rmdir manage the tree", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        expect(captureCall((callback) => shim.mkdir("/docs", 0o755, callback)).error).toBeNull();
        expect(
            captureCall((callback) => shim.mkdir("/docs/deep", 0o755, callback)).error,
        ).toBeNull();
        writeTextFile(shim, "/docs/readme.txt", "text");
        const docsEntries = captureCall((callback) => shim.readdir("/docs", callback));
        expect([...(docsEntries.value as Array<string>)].sort()).toEqual(["deep", "readme.txt"]);
        const stats = captureCall((callback) => shim.stat("/docs", callback));
        expect((stats.value as { isDirectory(): boolean }).isDirectory()).toBe(true);
        const notEmpty = captureCall((callback) => shim.rmdir("/docs", callback));
        expect(errorCodeOf(notEmpty.error)).toBe("ENOTEMPTY");
        expect(
            captureCall((callback) => shim.unlink("/docs/readme.txt", callback)).error,
        ).toBeNull();
        expect(captureCall((callback) => shim.rmdir("/docs/deep", callback)).error).toBeNull();
        expect(captureCall((callback) => shim.rmdir("/docs", callback)).error).toBeNull();
        const rootEntries = captureCall((callback) => shim.readdir("/", callback));
        expect(rootEntries.value as Array<string>).toEqual([]);
    });
    test("renames files and whole directory trees", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        writeTextFile(shim, "/a.txt", "one");
        expect(
            captureCall((callback) => shim.rename("/a.txt", "/b.txt", callback)).error,
        ).toBeNull();
        expect(readTextFile(shim, "/b.txt")).toBe("one");
        expect(errorCodeOf(captureCall((callback) => shim.stat("/a.txt", callback)).error)).toBe(
            "ENOENT",
        );
        captureCall((callback) => shim.mkdir("/x", 0o755, callback));
        captureCall((callback) => shim.mkdir("/x/y", 0o755, callback));
        writeTextFile(shim, "/x/y/f.txt", "nested");
        expect(captureCall((callback) => shim.rename("/x", "/z", callback)).error).toBeNull();
        expect(readTextFile(shim, "/z/y/f.txt")).toBe("nested");
        expect(errorCodeOf(captureCall((callback) => shim.stat("/x", callback)).error)).toBe(
            "ENOENT",
        );
    });
    test("reports sensible errors for missing paths and bad descriptors", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        expect(errorCodeOf(openFile(shim, "/missing.txt", 0).error)).toBe("ENOENT");
        expect(
            errorCodeOf(
                openFile(
                    shim,
                    "/absent/child.txt",
                    shim.constants.O_WRONLY | shim.constants.O_CREAT,
                ).error,
            ),
        ).toBe("ENOENT");
        writeTextFile(shim, "/present.txt", "x");
        expect(
            errorCodeOf(
                openFile(
                    shim,
                    "/present.txt",
                    shim.constants.O_WRONLY | shim.constants.O_CREAT | shim.constants.O_EXCL,
                ).error,
            ),
        ).toBe("EEXIST");
        const badRead = captureCall((callback) =>
            shim.read(97, new Uint8Array(4), 0, 4, null, callback),
        );
        expect(errorCodeOf(badRead.error)).toBe("EBADF");
        const fileAsDirectory = captureCall((callback) => shim.readdir("/present.txt", callback));
        expect(errorCodeOf(fileAsDirectory.error)).toBe("ENOTDIR");
    });
});
describe("GoWasmFileSystemShim standard streams", () => {
    test("feeds stdin bytes with a trailing newline and signals exhaustion", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        shim.feedLine("aé");
        const first = readBytesFromDescriptor(shim, 0, 2);
        expect(first.count).toBe(2);
        expect([...first.bytes]).toEqual([0x61, 0xc3]);
        const second = readBytesFromDescriptor(shim, 0, 10);
        expect(second.count).toBe(2);
        expect([...second.bytes]).toEqual([0xa9, 0x0a]);
        expect(shim.inputWasExhausted).toBe(false);
        expect(() => shim.read(0, new Uint8Array(4), 0, 4, null, () => {})).toThrow(
            TerminalInputNeededSignal,
        );
        expect(shim.inputWasExhausted).toBe(true);
    });
    test("routes descriptor output to the sink and suppresses it after exhaustion", () => {
        const sink = new RecordingOutputSink();
        const shim = new GoWasmFileSystemShim(sink);
        const firstBytes = new TextEncoder().encode("stdout\n");
        captureCall((callback) => shim.write(1, firstBytes, 0, firstBytes.length, null, callback));
        const traceBytes = new TextEncoder().encode("stderr\n");
        expect(shim.writeSync(2, traceBytes)).toBe(traceBytes.length);
        expect(sink.text).toBe("stdout\nstderr\n");
        expect(() => shim.read(0, new Uint8Array(1), 0, 1, null, () => {})).toThrow(
            TerminalInputNeededSignal,
        );
        const suppressedBytes = new TextEncoder().encode("panic trace\n");
        shim.writeSync(2, suppressedBytes);
        captureCall((callback) =>
            shim.write(1, suppressedBytes, 0, suppressedBytes.length, null, callback),
        );
        expect(sink.text).toBe("stdout\nstderr\n");
    });
    test("returns zero for a zero-length stdin read without consuming input", () => {
        const shim = new GoWasmFileSystemShim(new RecordingOutputSink());
        const result = captureCall((callback) =>
            shim.read(0, new Uint8Array(0), 0, 0, null, callback),
        );
        expect(result.value).toBe(0);
        expect(shim.inputWasExhausted).toBe(false);
    });
});
