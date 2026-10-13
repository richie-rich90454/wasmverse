import { delimiter, resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const TEAVM_VERSION = "0.15.0";
const TEAVM_OUTPUT_RELATIVE_PATH = "target/wasmverse";
const JDK_DIRECTORY = "./.tools/jdk";
const MAVEN_REPOSITORY_DIRECTORY = "./.tools/maven-repo";
function mavenBinaryPathForPlatform(platformName: NodeJS.Platform): string {
    return platformName === "win32" ? "./.tools/maven/bin/mvn.cmd" : "./.tools/maven/bin/mvn";
}
function mavenProjectText(
    artifactId: string,
    mainClassName: string,
    targetDirectory: string,
): string {
    return (
        '<project xmlns="http://maven.apache.org/POM/4.0.0">\n' +
        "    <modelVersion>4.0.0</modelVersion>\n" +
        "    <groupId>wasmverse</groupId>\n" +
        `    <artifactId>${artifactId}</artifactId>\n` +
        "    <version>0.1.0</version>\n" +
        "    <properties>\n" +
        "        <maven.compiler.release>11</maven.compiler.release>\n" +
        "        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>\n" +
        "    </properties>\n" +
        "    <dependencies>\n" +
        "        <dependency>\n" +
        "            <groupId>org.teavm</groupId>\n" +
        "            <artifactId>teavm-classlib</artifactId>\n" +
        `            <version>${TEAVM_VERSION}</version>\n` +
        "        </dependency>\n" +
        "    </dependencies>\n" +
        "    <build>\n" +
        "        <plugins>\n" +
        "            <plugin>\n" +
        "                <groupId>org.apache.maven.plugins</groupId>\n" +
        "                <artifactId>maven-compiler-plugin</artifactId>\n" +
        "                <version>3.13.0</version>\n" +
        "            </plugin>\n" +
        "            <plugin>\n" +
        "                <groupId>org.teavm</groupId>\n" +
        "                <artifactId>teavm-maven-plugin</artifactId>\n" +
        `                <version>${TEAVM_VERSION}</version>\n` +
        "                <executions>\n" +
        "                    <execution>\n" +
        "                        <phase>package</phase>\n" +
        "                        <goals><goal>compile</goal></goals>\n" +
        "                        <configuration>\n" +
        `                            <mainClass>${mainClassName}</mainClass>\n` +
        `                            <targetDirectory>${targetDirectory}</targetDirectory>\n` +
        "                            <targetFileName>classes.js</targetFileName>\n" +
        "                            <jsModuleType>ES2015</jsModuleType>\n" +
        "                            <minifying>false</minifying>\n" +
        "                            <optimizationLevel>SIMPLE</optimizationLevel>\n" +
        "                        </configuration>\n" +
        "                    </execution>\n" +
        "                </executions>\n" +
        "            </plugin>\n" +
        "        </plugins>\n" +
        "    </build>\n" +
        "</project>\n"
    );
}
function artifactIdForSession(sessionIdentifier: string): string {
    const sanitized = sessionIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `showcase-${sanitized || "session"}`;
}
class TeaVmCompilerStrategy implements CompilerStrategyContract {
    private readonly processRunner: ProcessRunner;
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly teaVmDirectory: string;
    private readonly platformName: NodeJS.Platform;
    private readonly mavenBinaryPath: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        teaVmDirectory: string = "./.tools/teavm",
        platformName: NodeJS.Platform = process.platform,
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.teaVmDirectory = teaVmDirectory;
        this.platformName = platformName;
        this.mavenBinaryPath = mavenBinaryPathForPlatform(platformName);
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.teaVmDirectory);
        if (!toolchainExists) {
            throw new Error(
                "TeaVM toolchain not found. Run pnpm run setup to provision ./.tools/teavm/.",
            );
        }
        if (!(await this.fileSystemOperations.pathExists(this.mavenBinaryPath))) {
            throw new Error(
                "Maven not found. Run pnpm run setup to provision ./.tools/maven/ and ./.tools/jdk/.",
            );
        }
        await this.ensureMavenProject(context);
        const mavenExecutable = resolve(process.cwd(), this.mavenBinaryPath);
        const mavenArguments = [
            `-Dmaven.repo.local=${resolve(process.cwd(), MAVEN_REPOSITORY_DIRECTORY)}`,
            "-q",
            "package",
        ];
        const jdkDirectory = resolve(process.cwd(), JDK_DIRECTORY);
        const environmentOverrides = {
            JAVA_HOME: jdkDirectory,
            PATH: `${resolve(jdkDirectory, "bin")}${delimiter}${process.env.PATH ?? ""}`,
        };
        const outcome = await this.processRunner.runToCompletion(
            this.platformName === "win32"
                ? ["cmd", "/c", mavenExecutable, ...mavenArguments]
                : [mavenExecutable, ...mavenArguments],
            { workingDirectory: context.sourceDirectory, environmentOverrides },
        );
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`TeaVM build failed: ${detail}`);
        }
        await this.publishTeaVmOutput(context);
    }
    private async publishTeaVmOutput(context: BuildContextRecord): Promise<void> {
        const teavmOutputDirectory = `${context.sourceDirectory}/${TEAVM_OUTPUT_RELATIVE_PATH}`;
        const producedFiles =
            await this.fileSystemOperations.listFilesRecursively(teavmOutputDirectory);
        for (const relativePath of producedFiles) {
            await this.fileSystemOperations.copyFileInto(
                `${teavmOutputDirectory}/${relativePath}`,
                `${context.runtimeDirectory}/${relativePath}`,
            );
        }
    }
    private async ensureMavenProject(context: BuildContextRecord): Promise<void> {
        const projectFile = `${context.sourceDirectory}/pom.xml`;
        if (await this.fileSystemOperations.pathExists(projectFile)) {
            return;
        }
        const baseName = (context.entryFileRelativePath.split("/").pop() as string).replace(
            /\.java$/i,
            "",
        );
        await this.fileSystemOperations.writeTextFile(
            projectFile,
            mavenProjectText(
                artifactIdForSession(context.sessionIdentifier),
                baseName,
                TEAVM_OUTPUT_RELATIVE_PATH,
            ),
        );
        const entrySource = await this.fileSystemOperations.readTextFile(
            `${context.sourceDirectory}/${context.entryFileRelativePath}`,
        );
        await this.fileSystemOperations.writeTextFile(
            `${context.sourceDirectory}/src/main/java/${baseName}.java`,
            entrySource,
        );
    }
}
export { TeaVmCompilerStrategy };
