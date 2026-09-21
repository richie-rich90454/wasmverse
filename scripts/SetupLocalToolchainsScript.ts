import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { LocalToolchainProvisioner } from "@serverAtelier/LocalToolchainProvisioner.ts";
const scopedLogger = new ScopedLogger("SetupLocalToolchainsScript");
const fileSystemOperations = new FileSystemOperations();
const processRunner = new ProcessRunner();
const toolchainProvisioner = new LocalToolchainProvisioner(
    fileSystemOperations,
    processRunner,
    scopedLogger,
);
await toolchainProvisioner.provisionAllToolchains();
scopedLogger.logSuccess(
    "Toolchain provisioning complete. Missing optional toolchains are not fatal.",
);
