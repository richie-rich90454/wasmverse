import { Account, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { createEVM } from "@ethereumjs/evm";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
import { loadSolidityCompiler } from "@clientTheatre/runtimePerformers/SolidityCompiler.ts";
import type { SolidityCompilerInstance } from "@clientTheatre/runtimePerformers/SolidityCompiler.ts";
import {
    concatBytes,
    decodeStringArrayResult,
    decodeStringResult,
    encodeFunctionSelector,
    encodeStringArrayArgument,
} from "@clientTheatre/runtimePerformers/SolidityAbiCodec.ts";
const SOLIDITY_RUNTIME_DIRECTORY_NAME = "solidity";
const SOLC_WORKER_FILE_NAME = "solc-worker.js";
const SOLC_BUNDLE_FILE_NAME = "soljson.js";
const CALL_GAS_LIMIT = 10_000_000n;
const DEPLOYER_ADDRESS = "0x00000000000000000000000000000000000000ee";
const REVERT_SELECTOR = "0x08c379a0";
interface SolidityAbiParameter {
    name: string;
    type: string;
}
interface SolidityAbiEntry {
    type: string;
    name?: string;
    inputs?: ReadonlyArray<SolidityAbiParameter>;
    outputs?: ReadonlyArray<SolidityAbiParameter>;
}
interface SolidityContractOutput {
    abi: ReadonlyArray<SolidityAbiEntry>;
    evm: { bytecode: { object: string } };
}
interface SolidityCompilationOutput {
    errors?: ReadonlyArray<{ severity: string; formattedMessage: string }>;
    contracts?: Record<string, Record<string, SolidityContractOutput>>;
}
interface SolidityExecutionResult {
    createdAddress?: { toString(): string };
    execResult: {
        exceptionError?: { error?: string; errorMessage?: string };
        returnValue: Uint8Array;
    };
}
class SolidityPerformer implements TerminalPerformerContract {
    private readonly assetLocator: RuntimeAssetLocator;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private compiler: SolidityCompilerInstance | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading the Solidity compiler.");
        try {
            this.compiler = await loadSolidityCompiler(
                this.assetLocator.resolveAssetUrl(
                    `runtime/${SOLIDITY_RUNTIME_DIRECTORY_NAME}/${SOLC_WORKER_FILE_NAME}`,
                ),
                this.assetLocator.resolveAssetUrl(
                    `runtime/${SOLIDITY_RUNTIME_DIRECTORY_NAME}/${SOLC_BUNDLE_FILE_NAME}`,
                ),
            );
        } catch (loadError) {
            throw new Error(
                `Solidity compiler failed to load: ${this.describeSolidityError(loadError)}`,
            );
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine(`Solidity compiler ready (${this.compiler.version}).`);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.compiler) {
            throw new Error("Solidity compiler not loaded. Call loadInto first.");
        }
        stage.writeLine("Compiling and running the Solidity contract.");
        this.outputTracker.beginRun();
        try {
            const compilationOutput = await this.compileProject();
            const contractOutput = this.selectEntryContract(compilationOutput);
            const mainEntry = this.selectMainFunction(contractOutput);
            const evm = await createEVM();
            const deployer = createAddressFromString(DEPLOYER_ADDRESS);
            await evm.stateManager.putAccount(deployer, new Account(0n, 10n ** 18n));
            const deployedAddress = await this.deployContract(evm, deployer, contractOutput);
            const callResult = await this.callMainFunction(
                evm,
                deployer,
                deployedAddress,
                mainEntry,
            );
            this.appendDecodedOutputs(mainEntry, callResult);
        } catch (runError) {
            throw new Error(this.describeSolidityError(runError));
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private async compileProject(): Promise<SolidityCompilationOutput> {
        const sources: Record<string, { content: string }> = {};
        for (const [relativePath, sourceText] of this.userFiles) {
            sources[relativePath] = { content: sourceText };
        }
        const compileInput = {
            language: "Solidity",
            sources,
            settings: {
                outputSelection: {
                    "*": { "*": ["abi", "evm.bytecode.object"] },
                },
            },
        };
        const outputJson = await (this.compiler as SolidityCompilerInstance).compileStandardJson(
            JSON.stringify(compileInput),
            this.entryRelativePath,
        );
        const compilationOutput = JSON.parse(outputJson) as SolidityCompilationOutput;
        const fatalErrors = (compilationOutput.errors ?? []).filter(
            (compilationError) => compilationError.severity === "error",
        );
        if (fatalErrors.length > 0) {
            throw new Error(
                `Solidity compilation failed: ${(fatalErrors[0] as { formattedMessage: string }).formattedMessage}`,
            );
        }
        return compilationOutput;
    }
    private selectEntryContract(
        compilationOutput: SolidityCompilationOutput,
    ): SolidityContractOutput {
        const entryContracts = compilationOutput.contracts?.[this.entryRelativePath];
        if (!entryContracts || Object.keys(entryContracts).length === 0) {
            throw new Error(`No compiled contract found in ${this.entryRelativePath}.`);
        }
        const entrySourceText = this.userFiles.get(this.entryRelativePath) as string;
        const declaredContractNames = [
            ...entrySourceText.matchAll(/\bcontract\s+([A-Za-z_$][A-Za-z0-9_$]*)/g),
        ].map((match) => match[1] as string);
        for (const contractName of declaredContractNames) {
            const candidateContract = entryContracts[contractName];
            if (candidateContract) {
                return candidateContract;
            }
        }
        return entryContracts[Object.keys(entryContracts)[0] as string] as SolidityContractOutput;
    }
    private selectMainFunction(contractOutput: SolidityContractOutput): SolidityAbiEntry {
        const mainEntry = contractOutput.abi.find(
            (abiEntry) => abiEntry.type === "function" && abiEntry.name === "main",
        );
        if (!mainEntry) {
            throw new Error("The entry contract has no main function.");
        }
        const inputParameters = mainEntry.inputs ?? [];
        if (inputParameters.length === 0) {
            return mainEntry;
        }
        if (inputParameters.length === 1 && inputParameters[0]?.type === "string[]") {
            return mainEntry;
        }
        throw new Error("main must take no parameters or a single string[] parameter.");
    }
    private async deployContract(
        evm: Awaited<ReturnType<typeof createEVM>>,
        deployer: ReturnType<typeof createAddressFromString>,
        contractOutput: SolidityContractOutput,
    ): Promise<ReturnType<typeof createAddressFromString>> {
        const bytecode = contractOutput.evm.bytecode.object;
        if (bytecode.length === 0) {
            throw new Error("The entry contract has no deployable bytecode.");
        }
        const deployResult = (await evm.runCall({
            caller: deployer,
            data: hexToBytes(`0x${bytecode}`),
            gasLimit: CALL_GAS_LIMIT,
        })) as unknown as SolidityExecutionResult;
        if (deployResult.execResult.exceptionError) {
            throw new Error(
                `Contract deployment reverted: ${this.describeExecutionError(deployResult)}`,
            );
        }
        if (!deployResult.createdAddress) {
            throw new Error("Contract deployment produced no address.");
        }
        return deployResult.createdAddress as unknown as ReturnType<typeof createAddressFromString>;
    }
    private async callMainFunction(
        evm: Awaited<ReturnType<typeof createEVM>>,
        deployer: ReturnType<typeof createAddressFromString>,
        contractAddress: ReturnType<typeof createAddressFromString>,
        mainEntry: SolidityAbiEntry,
    ): Promise<SolidityExecutionResult> {
        const selector =
            (mainEntry.inputs ?? []).length === 1
                ? encodeFunctionSelector("main(string[])")
                : encodeFunctionSelector("main()");
        const calldata =
            (mainEntry.inputs ?? []).length === 1
                ? concatBytes(selector, encodeStringArrayArgument(this.programArguments))
                : selector;
        const callResult = (await evm.runCall({
            caller: deployer,
            to: contractAddress,
            data: calldata,
            gasLimit: CALL_GAS_LIMIT,
        })) as unknown as SolidityExecutionResult;
        if (callResult.execResult.exceptionError) {
            throw new Error(`main() reverted: ${this.describeExecutionError(callResult)}`);
        }
        return callResult;
    }
    private appendDecodedOutputs(
        mainEntry: SolidityAbiEntry,
        callResult: SolidityExecutionResult,
    ): void {
        const returnValue = callResult.execResult.returnValue;
        const outputParameters = mainEntry.outputs ?? [];
        if (returnValue.length === 0) {
            return;
        }
        if (outputParameters.length === 1 && outputParameters[0]?.type === "string[]") {
            for (const line of decodeStringArrayResult(returnValue)) {
                this.outputTracker.appendText(line + "\n");
            }
            return;
        }
        if (outputParameters.length === 1 && outputParameters[0]?.type === "string") {
            this.outputTracker.appendText(decodeStringResult(returnValue) + "\n");
            return;
        }
        const hexOutput = [...returnValue]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        this.outputTracker.appendText(`0x${hexOutput}\n`);
    }
    private describeExecutionError(callResult: SolidityExecutionResult): string {
        const returnValue = callResult.execResult.returnValue;
        const hexOutput = [...returnValue]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        if (returnValue.length >= 4 && `0x${hexOutput.slice(0, 8)}` === REVERT_SELECTOR) {
            return decodeStringResult(returnValue.subarray(4));
        }
        return (
            callResult.execResult.exceptionError?.errorMessage ??
            callResult.execResult.exceptionError?.error ??
            "unknown reason"
        );
    }
    private describeSolidityError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const collapsedMessage = rawMessage
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join(" ");
        return collapsedMessage.length > 300 ? collapsedMessage.slice(0, 300) : collapsedMessage;
    }
}
export { SolidityPerformer };
