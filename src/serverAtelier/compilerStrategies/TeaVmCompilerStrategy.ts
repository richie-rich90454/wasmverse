import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
const TEAVM_VERSION = "0.15.0";
function mavenProjectText(
    artifactId: string,
    mainClassName: string,
    targetDirectory: string,
): string {
    return (
        "<project xmlns=\"http://maven.apache.org/POM/4.0.0\">\n" +
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
    private readonly mavenBinaryName: string;
    constructor(
        processRunner: ProcessRunner,
        fileSystemOperations: FileSystemOperations,
        teaVmDirectory: string = "./.tools/teavm",
        mavenBinaryName: string = process.platform === "win32" ? "mvn.cmd" : "mvn",
    ) {
        this.processRunner = processRunner;
        this.fileSystemOperations = fileSystemOperations;
        this.teaVmDirectory = teaVmDirectory;
        this.mavenBinaryName = mavenBinaryName;
    }
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        const toolchainExists = await this.fileSystemOperations.pathExists(this.teaVmDirectory);
        if (!toolchainExists) {
            throw new Error(
                "TeaVM toolchain not found. Run bun run setup to provision ./.tools/teavm/.",
            );
        }
        await this.ensureMavenProject(context);
        let outcome;
        try {
            outcome = await this.processRunner.runToCompletion(
                [this.mavenBinaryName, "-q", "package"],
                { workingDirectory: context.sourceDirectory },
            );
        } catch {
            throw new Error(
                "Maven executable not found. Install Maven and ensure mvn is on PATH to build Java programs.",
            );
        }
        if (outcome.exitCode !== 0) {
            const detail =
                outcome.standardError.trim().length > 0
                    ? outcome.standardError
                    : outcome.standardOutput;
            throw new Error(`TeaVM build failed: ${detail}`);
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
                context.runtimeDirectory,
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
