import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
interface OutputBytesSink {
    appendBytes(bytes: Uint8Array): void;
}
interface OpenDescriptor {
    path: string;
    position: number;
    writeable: boolean;
    append: boolean;
    directory: boolean;
}
interface NodeStyleError extends Error {
    code: string;
}
type NodeStyleCallback = (error: NodeStyleError | null, value?: unknown) => void;
const FILE_TYPE_MASK = 0o170000;
const FILE_TYPE_DIRECTORY = 0o040000;
const FILE_TYPE_FILE = 0o100000;
const FILE_TYPE_CHARACTER_DEVICE = 0o020000;
const FILE_PERMISSION_BITS = 0o644;
const DIRECTORY_PERMISSION_BITS = 0o755;
const CHARACTER_DEVICE_PERMISSION_BITS = 0o666;
function nodeStyleError(code: string, message: string): NodeStyleError {
    const error = new Error(message) as NodeStyleError;
    error.code = code;
    return error;
}
function normalizePath(inputPath: string): string {
    const normalizedSegments: Array<string> = [];
    for (const segment of inputPath.split("/")) {
        if (segment.length === 0 || segment === ".") {
            continue;
        }
        if (segment === "..") {
            normalizedSegments.pop();
            continue;
        }
        normalizedSegments.push(segment);
    }
    return `/${normalizedSegments.join("/")}`;
}
function parentPathOf(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : path.slice(0, lastSlash);
}
function createStatsRecord(mode: number, size: number): Record<string, unknown> {
    const currentTime = Date.now();
    return {
        dev: 1,
        ino: 1,
        mode,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: 0,
        size,
        blksize: 4096,
        blocks: Math.ceil(size / 512),
        atimeMs: currentTime,
        mtimeMs: currentTime,
        ctimeMs: currentTime,
        isDirectory(): boolean {
            return (mode & FILE_TYPE_MASK) === FILE_TYPE_DIRECTORY;
        },
    };
}
class GoWasmFileSystemShim {
    readonly constants = {
        O_WRONLY: 1,
        O_RDWR: 2,
        O_CREAT: 64,
        O_EXCL: 128,
        O_TRUNC: 512,
        O_APPEND: 1024,
        O_DIRECTORY: 65536,
    };
    private readonly outputSink: OutputBytesSink;
    private readonly fileContents = new Map<string, Uint8Array>();
    private readonly directoryPaths = new Set<string>(["/"]);
    private readonly openDescriptors = new Map<number, OpenDescriptor>();
    private nextDescriptorNumber = 3;
    private readonly fedChunks: Array<Uint8Array> = [];
    private chunkHead = 0;
    private headOffset = 0;
    private fedLength = 0;
    private consumedLength = 0;
    private outputSuppressed = false;
    private inputExhausted = false;
    constructor(outputSink: OutputBytesSink) {
        this.outputSink = outputSink;
    }
    get inputWasExhausted(): boolean {
        return this.inputExhausted;
    }
    feedLine(line: string): void {
        const encoded = new TextEncoder().encode(`${line}\n`);
        this.fedChunks.push(encoded);
        this.fedLength += encoded.length;
    }
    seedUserFiles(userFiles: ReadonlyMap<string, string>): void {
        const textEncoder = new TextEncoder();
        for (const [relativePath, fileContent] of userFiles) {
            const filePath = normalizePath(relativePath);
            this.ensureParentDirectories(filePath);
            this.fileContents.set(filePath, textEncoder.encode(fileContent));
        }
    }
    installAsGlobalFileSystem(): void {
        (globalThis as Record<string, unknown>).fs = this;
    }
    writeSync(fd: number, buffer: Uint8Array): number {
        if (fd === 1 || fd === 2) {
            this.emitOutput(buffer);
        }
        return buffer.length;
    }
    write(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
        callback: NodeStyleCallback,
    ): void {
        if (fd === 1 || fd === 2) {
            this.emitOutput(buffer.subarray(offset, offset + length));
            callback(null, length);
            return;
        }
        const descriptor = this.openDescriptors.get(fd);
        if (!descriptor) {
            callback(nodeStyleError("EBADF", `write: bad file descriptor ${fd}`));
            return;
        }
        if (descriptor.directory) {
            callback(nodeStyleError("EISDIR", "write: is a directory"));
            return;
        }
        if (!descriptor.writeable) {
            callback(nodeStyleError("EBADF", "write: file is not opened for writing"));
            return;
        }
        const bytes = buffer.subarray(offset, offset + length);
        const existingBytes = this.fileContents.get(descriptor.path) ?? new Uint8Array(0);
        let writeOffset = position === null ? descriptor.position : Number(position);
        if (position === null && descriptor.append) {
            writeOffset = existingBytes.length;
        }
        const updatedBytes = new Uint8Array(
            Math.max(existingBytes.length, writeOffset + bytes.length),
        );
        updatedBytes.set(existingBytes);
        updatedBytes.set(bytes, writeOffset);
        this.fileContents.set(descriptor.path, updatedBytes);
        if (position === null) {
            descriptor.position = writeOffset + bytes.length;
        }
        callback(null, bytes.length);
    }
    read(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
        callback: NodeStyleCallback,
    ): void {
        if (fd === 0) {
            this.readFromFedInput(buffer, offset, length, callback);
            return;
        }
        const descriptor = this.openDescriptors.get(fd);
        if (!descriptor) {
            callback(nodeStyleError("EBADF", `read: bad file descriptor ${fd}`));
            return;
        }
        if (descriptor.directory) {
            callback(nodeStyleError("EISDIR", "read: is a directory"));
            return;
        }
        const fileBytes = this.fileContents.get(descriptor.path) ?? new Uint8Array(0);
        const readOffset = position === null ? descriptor.position : Number(position);
        const availableLength = Math.max(0, fileBytes.length - readOffset);
        const takeLength = Math.min(length, availableLength);
        if (takeLength > 0) {
            buffer.set(fileBytes.subarray(readOffset, readOffset + takeLength), offset);
        }
        if (position === null) {
            descriptor.position = readOffset + takeLength;
        }
        callback(null, takeLength);
    }
    open(path: string, flags: number, _mode: number, callback: NodeStyleCallback): void {
        const normalizedPath = normalizePath(String(path));
        const numericFlags = Number(flags);
        const writeable = (numericFlags & (this.constants.O_WRONLY | this.constants.O_RDWR)) !== 0;
        const createRequested = (numericFlags & this.constants.O_CREAT) !== 0;
        const exclusiveRequested = (numericFlags & this.constants.O_EXCL) !== 0;
        const truncateRequested = (numericFlags & this.constants.O_TRUNC) !== 0;
        const directoryRequested = (numericFlags & this.constants.O_DIRECTORY) !== 0;
        const existsAsFile = this.fileContents.has(normalizedPath);
        const existsAsDirectory = this.directoryPaths.has(normalizedPath);
        if (directoryRequested && !existsAsDirectory) {
            callback(
                nodeStyleError(
                    existsAsFile ? "ENOTDIR" : "ENOENT",
                    `open: ${normalizedPath} is not a directory`,
                ),
            );
            return;
        }
        if (existsAsDirectory) {
            if (writeable) {
                callback(nodeStyleError("EISDIR", `open: ${normalizedPath} is a directory`));
                return;
            }
            callback(
                null,
                this.registerDescriptor(normalizedPath, {
                    writeable: false,
                    append: false,
                    directory: true,
                }),
            );
            return;
        }
        if (existsAsFile && createRequested && exclusiveRequested) {
            callback(nodeStyleError("EEXIST", `open: ${normalizedPath} already exists`));
            return;
        }
        if (!existsAsFile) {
            if (!createRequested || !this.directoryPaths.has(parentPathOf(normalizedPath))) {
                callback(
                    nodeStyleError("ENOENT", `open: no such file or directory ${normalizedPath}`),
                );
                return;
            }
            this.fileContents.set(normalizedPath, new Uint8Array(0));
        }
        if (truncateRequested && writeable) {
            this.fileContents.set(normalizedPath, new Uint8Array(0));
        }
        callback(
            null,
            this.registerDescriptor(normalizedPath, {
                writeable,
                append: (numericFlags & this.constants.O_APPEND) !== 0,
                directory: false,
            }),
        );
    }
    close(fd: number, callback: NodeStyleCallback): void {
        if (fd === 0 || fd === 1 || fd === 2) {
            callback(null);
            return;
        }
        if (!this.openDescriptors.delete(fd)) {
            callback(nodeStyleError("EBADF", `close: bad file descriptor ${fd}`));
            return;
        }
        callback(null);
    }
    fstat(fd: number, callback: NodeStyleCallback): void {
        if (fd === 0 || fd === 1 || fd === 2) {
            callback(
                null,
                createStatsRecord(FILE_TYPE_CHARACTER_DEVICE | CHARACTER_DEVICE_PERMISSION_BITS, 0),
            );
            return;
        }
        const descriptor = this.openDescriptors.get(fd);
        if (!descriptor) {
            callback(nodeStyleError("EBADF", `fstat: bad file descriptor ${fd}`));
            return;
        }
        if (descriptor.directory) {
            callback(null, createStatsRecord(FILE_TYPE_DIRECTORY | DIRECTORY_PERMISSION_BITS, 0));
            return;
        }
        const fileBytes = this.fileContents.get(descriptor.path) ?? new Uint8Array(0);
        callback(null, createStatsRecord(FILE_TYPE_FILE | FILE_PERMISSION_BITS, fileBytes.length));
    }
    stat(path: string, callback: NodeStyleCallback): void {
        this.statPath(String(path), callback);
    }
    lstat(path: string, callback: NodeStyleCallback): void {
        this.statPath(String(path), callback);
    }
    readdir(path: string, callback: NodeStyleCallback): void {
        const normalizedPath = normalizePath(String(path));
        if (!this.directoryPaths.has(normalizedPath)) {
            callback(
                nodeStyleError(
                    this.fileContents.has(normalizedPath) ? "ENOTDIR" : "ENOENT",
                    `readdir: ${normalizedPath}`,
                ),
            );
            return;
        }
        callback(null, this.childNamesOf(normalizedPath));
    }
    mkdir(path: string, _mode: number, callback: NodeStyleCallback): void {
        const normalizedPath = normalizePath(String(path));
        if (this.fileContents.has(normalizedPath) || this.directoryPaths.has(normalizedPath)) {
            callback(nodeStyleError("EEXIST", `mkdir: ${normalizedPath} already exists`));
            return;
        }
        if (!this.directoryPaths.has(parentPathOf(normalizedPath))) {
            callback(nodeStyleError("ENOENT", `mkdir: parent of ${normalizedPath} is missing`));
            return;
        }
        this.directoryPaths.add(normalizedPath);
        callback(null);
    }
    rmdir(path: string, callback: NodeStyleCallback): void {
        const normalizedPath = normalizePath(String(path));
        if (normalizedPath === "/") {
            callback(nodeStyleError("EBUSY", "rmdir: the root directory cannot be removed"));
            return;
        }
        if (this.fileContents.has(normalizedPath)) {
            callback(nodeStyleError("ENOTDIR", `rmdir: ${normalizedPath} is a file`));
            return;
        }
        if (!this.directoryPaths.has(normalizedPath)) {
            callback(nodeStyleError("ENOENT", `rmdir: no such directory ${normalizedPath}`));
            return;
        }
        if (this.childNamesOf(normalizedPath).length > 0) {
            callback(nodeStyleError("ENOTEMPTY", `rmdir: ${normalizedPath} is not empty`));
            return;
        }
        this.directoryPaths.delete(normalizedPath);
        callback(null);
    }
    unlink(path: string, callback: NodeStyleCallback): void {
        const normalizedPath = normalizePath(String(path));
        if (this.directoryPaths.has(normalizedPath)) {
            callback(nodeStyleError("EISDIR", `unlink: ${normalizedPath} is a directory`));
            return;
        }
        if (!this.fileContents.delete(normalizedPath)) {
            callback(nodeStyleError("ENOENT", `unlink: no such file ${normalizedPath}`));
            return;
        }
        callback(null);
    }
    rename(fromPath: string, toPath: string, callback: NodeStyleCallback): void {
        const sourcePath = normalizePath(String(fromPath));
        const destinationPath = normalizePath(String(toPath));
        const sourceIsFile = this.fileContents.has(sourcePath);
        const sourceIsDirectory = this.directoryPaths.has(sourcePath);
        if (!sourceIsFile && !sourceIsDirectory) {
            callback(nodeStyleError("ENOENT", `rename: no such file ${sourcePath}`));
            return;
        }
        if (!this.directoryPaths.has(parentPathOf(destinationPath))) {
            callback(nodeStyleError("ENOENT", `rename: parent of ${destinationPath} is missing`));
            return;
        }
        if (sourceIsDirectory && this.fileContents.has(destinationPath)) {
            callback(nodeStyleError("ENOTDIR", `rename: ${destinationPath} is a file`));
            return;
        }
        if (sourceIsDirectory && this.directoryPaths.has(destinationPath)) {
            if (this.childNamesOf(destinationPath).length > 0) {
                callback(nodeStyleError("ENOTEMPTY", `rename: ${destinationPath} is not empty`));
                return;
            }
            this.directoryPaths.delete(destinationPath);
        }
        if (sourceIsFile) {
            if (this.directoryPaths.has(destinationPath)) {
                callback(nodeStyleError("EISDIR", `rename: ${destinationPath} is a directory`));
                return;
            }
            this.fileContents.set(destinationPath, this.fileContents.get(sourcePath) as Uint8Array);
            this.fileContents.delete(sourcePath);
        } else {
            this.moveDirectoryTree(sourcePath, destinationPath);
        }
        callback(null);
    }
    chmod(path: string, _mode: number, callback: NodeStyleCallback): void {
        this.withExistingPath(String(path), callback, () => callback(null));
    }
    chown(path: string, _uid: number, _gid: number, callback: NodeStyleCallback): void {
        this.withExistingPath(String(path), callback, () => callback(null));
    }
    lchown(path: string, _uid: number, _gid: number, callback: NodeStyleCallback): void {
        this.withExistingPath(String(path), callback, () => callback(null));
    }
    fchmod(fd: number, _mode: number, callback: NodeStyleCallback): void {
        this.withOpenDescriptor(fd, callback, () => callback(null));
    }
    fchown(fd: number, _uid: number, _gid: number, callback: NodeStyleCallback): void {
        this.withOpenDescriptor(fd, callback, () => callback(null));
    }
    utimes(path: string, _atime: number, _mtime: number, callback: NodeStyleCallback): void {
        this.withExistingPath(String(path), callback, () => callback(null));
    }
    truncate(path: string, length: number, callback: NodeStyleCallback): void {
        const requestedLength = Number(length);
        if (requestedLength < 0) {
            callback(nodeStyleError("EINVAL", "truncate: negative length"));
            return;
        }
        const normalizedPath = normalizePath(String(path));
        if (this.directoryPaths.has(normalizedPath)) {
            callback(nodeStyleError("EISDIR", `truncate: ${normalizedPath} is a directory`));
            return;
        }
        if (!this.fileContents.has(normalizedPath)) {
            callback(nodeStyleError("ENOENT", `truncate: no such file ${normalizedPath}`));
            return;
        }
        this.resizeFile(normalizedPath, requestedLength);
        callback(null);
    }
    ftruncate(fd: number, length: number, callback: NodeStyleCallback): void {
        const requestedLength = Number(length);
        if (requestedLength < 0) {
            callback(nodeStyleError("EINVAL", "ftruncate: negative length"));
            return;
        }
        const descriptor = this.openDescriptors.get(fd);
        if (!descriptor || descriptor.directory) {
            callback(nodeStyleError("EINVAL", `ftruncate: not a regular file descriptor ${fd}`));
            return;
        }
        this.resizeFile(descriptor.path, requestedLength);
        callback(null);
    }
    fsync(fd: number, callback: NodeStyleCallback): void {
        this.withOpenDescriptor(fd, callback, () => callback(null));
    }
    readlink(_path: string, callback: NodeStyleCallback): void {
        callback(nodeStyleError("EINVAL", "readlink: symbolic links are not supported"));
    }
    symlink(_path: string, _link: string, callback: NodeStyleCallback): void {
        callback(nodeStyleError("ENOSYS", "symlink: symbolic links are not supported"));
    }
    link(_path: string, _link: string, callback: NodeStyleCallback): void {
        callback(nodeStyleError("ENOSYS", "link: hard links are not supported"));
    }
    private readFromFedInput(
        buffer: Uint8Array,
        offset: number,
        length: number,
        callback: NodeStyleCallback,
    ): void {
        if (length === 0) {
            callback(null, 0);
            return;
        }
        const availableLength = this.fedLength - this.consumedLength;
        if (availableLength <= 0) {
            this.inputExhausted = true;
            this.outputSuppressed = true;
            throw new TerminalInputNeededSignal();
        }
        const takeLength = Math.min(length, availableLength);
        let filledLength = 0;
        while (filledLength < takeLength) {
            const headChunk = this.fedChunks[this.chunkHead] as Uint8Array;
            const chunkAvailable = headChunk.length - this.headOffset;
            const copyLength = Math.min(chunkAvailable, takeLength - filledLength);
            buffer.set(
                headChunk.subarray(this.headOffset, this.headOffset + copyLength),
                offset + filledLength,
            );
            filledLength += copyLength;
            this.headOffset += copyLength;
            this.consumedLength += copyLength;
            if (this.headOffset >= headChunk.length) {
                this.chunkHead++;
                this.headOffset = 0;
            }
        }
        callback(null, takeLength);
    }
    private emitOutput(bytes: Uint8Array): void {
        if (this.outputSuppressed) {
            return;
        }
        this.outputSink.appendBytes(bytes);
    }
    private registerDescriptor(
        path: string,
        options: { writeable: boolean; append: boolean; directory: boolean },
    ): number {
        const descriptorNumber = this.nextDescriptorNumber++;
        this.openDescriptors.set(descriptorNumber, {
            path,
            position: 0,
            writeable: options.writeable,
            append: options.append,
            directory: options.directory,
        });
        return descriptorNumber;
    }
    private statPath(path: string, callback: NodeStyleCallback): void {
        const normalizedPath = normalizePath(path);
        if (this.directoryPaths.has(normalizedPath)) {
            callback(null, createStatsRecord(FILE_TYPE_DIRECTORY | DIRECTORY_PERMISSION_BITS, 0));
            return;
        }
        const fileBytes = this.fileContents.get(normalizedPath);
        if (fileBytes) {
            callback(
                null,
                createStatsRecord(FILE_TYPE_FILE | FILE_PERMISSION_BITS, fileBytes.length),
            );
            return;
        }
        callback(nodeStyleError("ENOENT", `stat: no such file or directory ${normalizedPath}`));
    }
    private childNamesOf(directoryPath: string): Array<string> {
        const prefix = directoryPath === "/" ? "/" : `${directoryPath}/`;
        const childNames = new Set<string>();
        for (const candidatePath of this.fileContents.keys()) {
            if (candidatePath.startsWith(prefix)) {
                childNames.add(candidatePath.slice(prefix.length).split("/")[0] as string);
            }
        }
        for (const candidatePath of this.directoryPaths) {
            if (candidatePath !== directoryPath && candidatePath.startsWith(prefix)) {
                childNames.add(candidatePath.slice(prefix.length).split("/")[0] as string);
            }
        }
        return [...childNames];
    }
    private ensureParentDirectories(filePath: string): void {
        let currentPath = "";
        for (const segment of filePath.split("/").slice(1, -1)) {
            currentPath += `/${segment}`;
            this.directoryPaths.add(currentPath);
        }
    }
    private moveDirectoryTree(sourcePath: string, destinationPath: string): void {
        const movedDirectories: Array<string> = [];
        for (const directoryPath of this.directoryPaths) {
            if (directoryPath === sourcePath || directoryPath.startsWith(`${sourcePath}/`)) {
                movedDirectories.push(directoryPath);
            }
        }
        const movedFiles: Array<[string, Uint8Array]> = [];
        for (const [filePath, fileBytes] of this.fileContents) {
            if (filePath.startsWith(`${sourcePath}/`)) {
                movedFiles.push([filePath, fileBytes]);
            }
        }
        for (const directoryPath of movedDirectories) {
            this.directoryPaths.delete(directoryPath);
        }
        for (const [filePath] of movedFiles) {
            this.fileContents.delete(filePath);
        }
        for (const directoryPath of movedDirectories) {
            this.directoryPaths.add(`${destinationPath}${directoryPath.slice(sourcePath.length)}`);
        }
        for (const [filePath, fileBytes] of movedFiles) {
            this.fileContents.set(
                `${destinationPath}${filePath.slice(sourcePath.length)}`,
                fileBytes,
            );
        }
    }
    private resizeFile(filePath: string, requestedLength: number): void {
        const existingBytes = this.fileContents.get(filePath) ?? new Uint8Array(0);
        const resizedBytes = new Uint8Array(requestedLength);
        resizedBytes.set(
            existingBytes.subarray(0, Math.min(existingBytes.length, requestedLength)),
        );
        this.fileContents.set(filePath, resizedBytes);
    }
    private withExistingPath(
        path: string,
        callback: NodeStyleCallback,
        action: (normalizedPath: string) => void,
    ): void {
        const normalizedPath = normalizePath(path);
        if (!this.fileContents.has(normalizedPath) && !this.directoryPaths.has(normalizedPath)) {
            callback(nodeStyleError("ENOENT", `no such file or directory ${normalizedPath}`));
            return;
        }
        action(normalizedPath);
    }
    private withOpenDescriptor(fd: number, callback: NodeStyleCallback, action: () => void): void {
        if (fd === 0 || fd === 1 || fd === 2 || this.openDescriptors.has(fd)) {
            action();
            return;
        }
        callback(nodeStyleError("EBADF", `bad file descriptor ${fd}`));
    }
}
export { GoWasmFileSystemShim };
