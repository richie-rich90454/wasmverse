import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const SOLIDITY_RUNTIME_DIRECTORY_NAME = "solidity";
const SOLC_BUNDLE_FILE_NAME = "soljson.js";
const SOLC_WORKER_FILE_NAME = "solc-worker.js";
const SOLC_WORKER_SOURCE = String.raw`"use strict";
var compilerModule = null;
function messageTextOf(error) {
    if (error && typeof error.message === "string" && error.message.length > 0) {
        return error.message;
    }
    return String(error);
}
function directoryOf(relativePath) {
    var separatorIndex = relativePath.lastIndexOf("/");
    return separatorIndex >= 0 ? relativePath.slice(0, separatorIndex) : "";
}
function joinRelativePath(directory, relativePath) {
    return directory.length > 0 ? directory + "/" + relativePath : relativePath;
}
function normalizeWithinRoot(rawPath) {
    var normalizedSegments = [];
    var rawSegments = rawPath.replace(/\\/g, "/").split("/");
    for (var segmentIndex = 0; segmentIndex < rawSegments.length; segmentIndex++) {
        var rawSegment = rawSegments[segmentIndex];
        if (rawSegment.length === 0 || rawSegment === ".") {
            continue;
        }
        if (rawSegment === "..") {
            if (normalizedSegments.length === 0) {
                throw new Error("Path escapes the project root: " + rawPath);
            }
            normalizedSegments.pop();
            continue;
        }
        normalizedSegments.push(rawSegment);
    }
    return normalizedSegments.join("/");
}
function resolveImportedSource(importPath, entryRelativePath, sources) {
    var entryDirectory = directoryOf(entryRelativePath);
    var candidatePaths = [
        normalizeWithinRoot(joinRelativePath(entryDirectory, importPath)),
        normalizeWithinRoot(importPath),
    ];
    for (var candidateIndex = 0; candidateIndex < candidatePaths.length; candidateIndex++) {
        if (Object.prototype.hasOwnProperty.call(sources, candidatePaths[candidateIndex])) {
            return candidatePaths[candidateIndex];
        }
    }
    var importBasename = importPath.split("/").pop();
    var sourceKeys = Object.keys(sources);
    for (var sourceIndex = 0; sourceIndex < sourceKeys.length; sourceIndex++) {
        if (sourceKeys[sourceIndex].split("/").pop() === importBasename) {
            return sourceKeys[sourceIndex];
        }
    }
    return undefined;
}
function writeCString(moduleHandle, text, pointer) {
    var byteLength = moduleHandle.lengthBytesUTF8(text);
    var allocate = moduleHandle.cwrap("solidity_alloc", "number", ["number"]);
    var bufferPointer = allocate(byteLength + 1);
    moduleHandle.stringToUTF8(text, bufferPointer, byteLength + 1);
    moduleHandle.setValue(pointer, bufferPointer, "*");
}
function compileStandardJson(moduleHandle, inputJson, entryRelativePath) {
    var parsedInput = JSON.parse(inputJson);
    var sources = parsedInput.sources || {};
    var compileFunction = moduleHandle.cwrap("solidity_compile", "string", [
        "string",
        "number",
        "number",
    ]);
    var callback = function (context, kind, data, contents, error) {
        if (moduleHandle.UTF8ToString(kind) !== "source") {
            writeCString(moduleHandle, "SMT solver callback not supported", error);
            return;
        }
        var importPath = moduleHandle.UTF8ToString(data);
        var resolvedPath = resolveImportedSource(importPath, entryRelativePath, sources);
        if (resolvedPath === undefined) {
            writeCString(moduleHandle, "Source not found: " + importPath, error);
            return;
        }
        var sourceEntry = sources[resolvedPath];
        var sourceContent =
            sourceEntry && typeof sourceEntry.content === "string" ? sourceEntry.content : "";
        writeCString(moduleHandle, sourceContent, contents);
    };
    var callbackPointer = moduleHandle.addFunction(callback, "viiiii");
    try {
        return compileFunction(inputJson, callbackPointer, 0);
    } finally {
        moduleHandle.removeFunction(callbackPointer);
    }
}
function loadCompiler(soljsonScriptUrl) {
    compilerModule = null;
    return new Promise(function (resolveInitialized, rejectInitialized) {
        self.Module = {
            print: function () {},
            printErr: function () {},
            onRuntimeInitialized: function () {
                resolveInitialized();
            },
        };
        try {
            importScripts(soljsonScriptUrl);
        } catch (loadError) {
            rejectInitialized(loadError);
        }
    }).then(function () {
        compilerModule = self.Module;
        var versionFunction = compilerModule.cwrap("solidity_version", "string", []);
        return versionFunction();
    });
}
self.onmessage = function (event) {
    var message = event.data;
    if (message.kind === "load") {
        loadCompiler(message.soljsonScriptUrl).then(
            function (version) {
                self.postMessage({
                    requestIdentifier: message.requestIdentifier,
                    kind: "loaded",
                    version: version,
                });
            },
            function (loadError) {
                self.postMessage({
                    requestIdentifier: message.requestIdentifier,
                    kind: "failed",
                    message: messageTextOf(loadError),
                });
            },
        );
        return;
    }
    if (message.kind === "compile") {
        if (!compilerModule) {
            self.postMessage({
                requestIdentifier: message.requestIdentifier,
                kind: "failed",
                message: "the Solidity compiler is not loaded",
            });
            return;
        }
        try {
            var outputJson = compileStandardJson(
                compilerModule,
                message.inputJson,
                message.entryRelativePath,
            );
            self.postMessage({
                requestIdentifier: message.requestIdentifier,
                kind: "compiled",
                outputJson: outputJson,
            });
        } catch (compileError) {
            self.postMessage({
                requestIdentifier: message.requestIdentifier,
                kind: "failed",
                message: messageTextOf(compileError),
            });
        }
        return;
    }
};
`;
class SoliditySolcRuntimeAssembler implements RuntimeAssetAssemblerContract {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly solcPackageDirectory: string;
    constructor(
        fileSystemOperations: FileSystemOperations,
        solcPackageDirectory: string = "./node_modules/solc",
    ) {
        this.fileSystemOperations = fileSystemOperations;
        this.solcPackageDirectory = solcPackageDirectory;
    }
    async assembleRuntimeInto(context: BuildContextRecord): Promise<void> {
        const runtimeDirectory = `${context.runtimeDirectory}/${SOLIDITY_RUNTIME_DIRECTORY_NAME}`;
        const sourcePath = `${this.solcPackageDirectory}/${SOLC_BUNDLE_FILE_NAME}`;
        if (!(await this.fileSystemOperations.pathExists(sourcePath))) {
            throw new Error(
                `Solc runtime file ${SOLC_BUNDLE_FILE_NAME} is missing. Run pnpm install.`,
            );
        }
        await this.fileSystemOperations.copyFileInto(
            sourcePath,
            `${runtimeDirectory}/${SOLC_BUNDLE_FILE_NAME}`,
        );
        await this.fileSystemOperations.writeTextFile(
            `${runtimeDirectory}/${SOLC_WORKER_FILE_NAME}`,
            SOLC_WORKER_SOURCE,
        );
    }
}
export { SoliditySolcRuntimeAssembler, SOLC_WORKER_SOURCE };
