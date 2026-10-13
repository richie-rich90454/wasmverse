import { useEffect, useState } from "react";
import type { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import "@clientTheatre/styles/ProjectAuthoring.css";
interface GitHubImportViewProperties {
    applicationController: ClientApplicationController;
}
function GitHubImportView(properties: GitHubImportViewProperties): React.JSX.Element {
    const applicationController = properties.applicationController;
    const githubImportController = applicationController.githubImportController;
    const [, forceRender] = useState(0);
    useEffect(() => {
        return githubImportController.subscribe(() =>
            forceRender((renderCount) => renderCount + 1),
        );
    }, [githubImportController]);
    const submissionInFlight =
        applicationController.currentState === "uploading" ||
        applicationController.currentState === "building";
    const canImport =
        githubImportController.repositoryReference.trim().length > 0 &&
        !githubImportController.isImporting &&
        !submissionInFlight;
    const handleImport = () => {
        if (canImport) {
            void applicationController.handleGitHubImport();
        }
    };
    return (
        <article className="quick-path-panel">
            <h3 className="quick-path-heading">Import from GitHub</h3>
            <p className="quick-path-support">
                owner/repo or a full github.com URL. The server clones and builds it.
            </p>
            <label className="quick-path-label" htmlFor="github-repository-reference">
                REPOSITORY
            </label>
            <input
                id="github-repository-reference"
                className="quick-path-input"
                type="text"
                placeholder="owner/repo"
                value={githubImportController.repositoryReference}
                onChange={(event) =>
                    githubImportController.setRepositoryReference(event.target.value)
                }
            />
            <label className="quick-path-label" htmlFor="github-requested-reference">
                REF (OPTIONAL)
            </label>
            <input
                id="github-requested-reference"
                className="quick-path-input"
                type="text"
                placeholder="main"
                value={githubImportController.requestedReference}
                onChange={(event) =>
                    githubImportController.setRequestedReference(event.target.value)
                }
            />
            <button
                className="project-action-button quick-path-run-button"
                type="button"
                disabled={!canImport}
                onClick={handleImport}
            >
                {githubImportController.isImporting ? "Importing" : "Import and run"}
            </button>
            {githubImportController.errorMessage.length > 0 && (
                <div className="quick-path-error" role="alert">
                    {githubImportController.errorMessage}
                </div>
            )}
        </article>
    );
}
export { GitHubImportView };
