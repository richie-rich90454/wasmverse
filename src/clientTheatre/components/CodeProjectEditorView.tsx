import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ClientApplicationController } from "@clientTheatre/services/ClientApplicationController.ts";
import type { CodeProjectEditorController } from "@clientTheatre/services/CodeProjectEditorController.ts";
import { Compartment, EditorState } from "@codemirror/state";
import {
    EditorView,
    drawSelection,
    dropCursor,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
    HighlightStyle,
    bracketMatching,
    indentOnInput,
    syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import "@clientTheatre/styles/ProjectAuthoring.css";
interface CodeProjectEditorViewProperties {
    applicationController: ClientApplicationController;
}
const CODE_EDITOR_HIGHLIGHT_STYLE = HighlightStyle.define([
    { tag: tags.keyword, color: "var(--brand-blue)", fontWeight: "600" },
    { tag: [tags.string, tags.special(tags.string)], color: "var(--success-green)" },
    { tag: [tags.number, tags.bool, tags.null], color: "var(--brand-blue-deep)" },
    { tag: tags.comment, color: "var(--ink-muted)", fontStyle: "italic" },
    {
        tag: [tags.function(tags.variableName), tags.definition(tags.variableName)],
        color: "var(--brand-blue-light)",
    },
    { tag: [tags.typeName, tags.className], color: "var(--error-red)" },
    { tag: tags.meta, color: "var(--ink-muted)" },
]);
const CODE_EDITOR_THEME = EditorView.theme({
    "&": {
        backgroundColor: "var(--paper)",
        color: "var(--ink)",
        fontSize: "13px",
        height: "100%",
    },
    ".cm-content": {
        caretColor: "var(--brand-blue)",
        fontFamily: "Menlo, Consolas, 'Courier New', monospace",
        padding: "8px 0",
    },
    ".cm-gutters": {
        backgroundColor: "var(--cream)",
        borderRight: "1px solid var(--rule)",
        color: "var(--ink-muted)",
    },
    ".cm-activeLine": { backgroundColor: "#f1eee5" },
    ".cm-activeLineGutter": { backgroundColor: "var(--cream)" },
    ".cm-cursor": { borderLeftColor: "var(--brand-blue)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "rgba(10, 77, 122, 0.16)",
    },
    ".cm-matchingBracket": {
        backgroundColor: "#e8e2d2",
        outline: "1px solid var(--rule-strong)",
    },
    ".cm-scroller": {
        fontFamily: "Menlo, Consolas, 'Courier New', monospace",
    },
    "&.cm-focused": { outline: "none" },
});
const codeEditorLanguageCompartment = new Compartment();
function createEditorState(
    editorController: CodeProjectEditorController,
    openFilePathReference: RefObject<string>,
    documentText: string,
): EditorState {
    return EditorState.create({
        doc: documentText,
        extensions: [
            codeEditorLanguageCompartment.of([]),
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            drawSelection(),
            dropCursor(),
            indentOnInput(),
            bracketMatching(),
            syntaxHighlighting(CODE_EDITOR_HIGHLIGHT_STYLE),
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            placeholder("Select a file in the tree, or add one to begin."),
            CODE_EDITOR_THEME,
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    const openFilePath = openFilePathReference.current;
                    if (openFilePath.length > 0) {
                        editorController.updateFileContent(
                            openFilePath,
                            update.state.doc.toString(),
                        );
                    }
                }
            }),
        ],
    });
}
function CodeProjectEditorView(properties: CodeProjectEditorViewProperties): React.JSX.Element {
    const applicationController = properties.applicationController;
    const editorController = applicationController.codeProjectEditorController;
    const [, forceRender] = useState(0);
    const editorHostReference = useRef<HTMLDivElement | null>(null);
    const editorViewReference = useRef<EditorView | null>(null);
    const openFilePathReference = useRef("");
    const languageLoadReference = useRef(0);
    const [newFilePath, setNewFilePath] = useState("");
    const [newFolderPath, setNewFolderPath] = useState("");
    const [renamePathText, setRenamePathText] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);
    useEffect(() => {
        return editorController.subscribe(() => forceRender((renderCount) => renderCount + 1));
    }, [editorController]);
    useEffect(() => {
        const editorHost = editorHostReference.current;
        if (!editorHost) {
            return;
        }
        const editorView = new EditorView({
            parent: editorHost,
            state: createEditorState(editorController, openFilePathReference, ""),
        });
        editorViewReference.current = editorView;
        return () => {
            editorView.destroy();
            editorViewReference.current = null;
        };
    }, [editorController]);
    const openFilePath = editorController.openFilePath;
    useEffect(() => {
        openFilePathReference.current = openFilePath;
        const editorView = editorViewReference.current;
        if (!editorView) {
            return;
        }
        const documentText =
            openFilePath.length > 0 ? editorController.sourceTextFor(openFilePath) : "";
        editorView.setState(
            createEditorState(editorController, openFilePathReference, documentText),
        );
        languageLoadReference.current += 1;
        const loadIdentifier = languageLoadReference.current;
        void editorController.loadLanguageSupportFor(openFilePath).then((languageSupport) => {
            if (
                loadIdentifier !== languageLoadReference.current ||
                editorViewReference.current !== editorView
            ) {
                return;
            }
            editorView.dispatch({
                effects: codeEditorLanguageCompartment.reconfigure(languageSupport),
            });
        });
    }, [editorController, openFilePath]);
    const treeEntries = editorController.treeEntries();
    const submissionInFlight =
        applicationController.currentState === "uploading" ||
        applicationController.currentState === "building";
    const canBuildAndRun =
        editorController.fileCount > 0 &&
        editorController.entryFilePath.length > 0 &&
        !submissionInFlight;
    const handleBuildAndRun = () => {
        if (canBuildAndRun) {
            void applicationController.handleEditorProjectSubmission();
        }
    };
    const handleCreateFile = () => {
        editorController.createFile(newFilePath);
        if (editorController.errorMessage.length === 0) {
            setNewFilePath("");
        }
    };
    const handleCreateFolder = () => {
        editorController.createFolder(newFolderPath);
        if (editorController.errorMessage.length === 0) {
            setNewFolderPath("");
        }
    };
    const handleBeginRename = () => {
        if (editorController.selectedPath.length === 0) {
            return;
        }
        setRenamePathText(editorController.selectedPath);
        setIsRenaming(true);
    };
    const handleApplyRename = () => {
        editorController.renameEntry(editorController.selectedPath, renamePathText);
        if (editorController.errorMessage.length === 0) {
            setIsRenaming(false);
            setRenamePathText("");
        }
    };
    const handleDeleteSelected = () => {
        if (editorController.selectedPath.length === 0) {
            return;
        }
        editorController.deleteEntry(editorController.selectedPath);
        setIsRenaming(false);
    };
    return (
        <section className="project-editor-section" aria-labelledby="project-editor-heading">
            <p className="project-section-eyebrow">THE WORKBENCH</p>
            <h2 className="project-section-heading" id="project-editor-heading">
                Compose a Project
            </h2>
            <p className="project-section-support">
                Create the files, mark the entry file, and build the project in place.
            </p>
            <div className="project-editor-frame">
                <div className="project-editor-toolbar">
                    <div className="project-editor-field">
                        <label className="project-editor-label" htmlFor="project-entry-select">
                            ENTRY FILE
                        </label>
                        <select
                            id="project-entry-select"
                            className="project-editor-select"
                            value={editorController.entryFilePath}
                            onChange={(event) =>
                                editorController.setEntryFilePath(event.target.value)
                            }
                        >
                            {editorController.fileCount === 0 ? (
                                <option value="">No files yet</option>
                            ) : (
                                editorController.filePaths().map((filePath) => (
                                    <option key={filePath} value={filePath}>
                                        {filePath}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                    <div className="project-editor-field">
                        <label className="project-editor-label" htmlFor="project-new-file">
                            NEW FILE
                        </label>
                        <input
                            id="project-new-file"
                            className="project-editor-input"
                            type="text"
                            placeholder="src/util.py"
                            value={newFilePath}
                            onChange={(event) => setNewFilePath(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    handleCreateFile();
                                }
                            }}
                        />
                    </div>
                    <div className="project-editor-actions">
                        <button
                            className="project-action-button"
                            type="button"
                            disabled={newFilePath.trim().length === 0}
                            onClick={handleCreateFile}
                        >
                            Add file
                        </button>
                    </div>
                    <div className="project-editor-field">
                        <label className="project-editor-label" htmlFor="project-new-folder">
                            NEW FOLDER
                        </label>
                        <input
                            id="project-new-folder"
                            className="project-editor-input"
                            type="text"
                            placeholder="src"
                            value={newFolderPath}
                            onChange={(event) => setNewFolderPath(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    handleCreateFolder();
                                }
                            }}
                        />
                    </div>
                    <div className="project-editor-actions">
                        <button
                            className="project-action-button"
                            type="button"
                            disabled={newFolderPath.trim().length === 0}
                            onClick={handleCreateFolder}
                        >
                            Add folder
                        </button>
                    </div>
                    <div className="project-editor-actions">
                        <button
                            className="project-action-button project-action-button-secondary"
                            type="button"
                            disabled={editorController.selectedPath.length === 0}
                            onClick={handleBeginRename}
                        >
                            Rename
                        </button>
                        <button
                            className="project-action-button project-action-button-secondary"
                            type="button"
                            disabled={editorController.selectedPath.length === 0}
                            onClick={handleDeleteSelected}
                        >
                            Delete
                        </button>
                    </div>
                </div>
                {isRenaming && (
                    <div className="project-editor-rename-row">
                        <div className="project-editor-field">
                            <label className="project-editor-label" htmlFor="project-rename-input">
                                RENAME SELECTED
                            </label>
                            <input
                                id="project-rename-input"
                                className="project-editor-input"
                                type="text"
                                value={renamePathText}
                                onChange={(event) => setRenamePathText(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        handleApplyRename();
                                    }
                                }}
                            />
                        </div>
                        <button
                            className="project-action-button"
                            type="button"
                            onClick={handleApplyRename}
                        >
                            Apply
                        </button>
                        <button
                            className="project-action-button project-action-button-secondary"
                            type="button"
                            onClick={() => setIsRenaming(false)}
                        >
                            Cancel
                        </button>
                    </div>
                )}
                {editorController.errorMessage.length > 0 && (
                    <div className="project-editor-error" role="alert">
                        {editorController.errorMessage}
                    </div>
                )}
                <div className="project-editor-workspace">
                    <div className="project-tree">
                        {treeEntries.length === 0 ? (
                            <p className="project-tree-empty">No files yet. Add one above.</p>
                        ) : (
                            treeEntries.map((treeEntry) => (
                                <button
                                    key={treeEntry.relativePath}
                                    type="button"
                                    className={`project-tree-row${
                                        treeEntry.relativePath === editorController.selectedPath
                                            ? " project-tree-row-selected"
                                            : ""
                                    }`}
                                    style={{ paddingLeft: `${8 + treeEntry.depth * 16}px` }}
                                    onClick={() =>
                                        editorController.selectPath(treeEntry.relativePath)
                                    }
                                >
                                    <span
                                        className={
                                            treeEntry.entryKind === "folder"
                                                ? "project-tree-name project-tree-folder-name"
                                                : "project-tree-name"
                                        }
                                    >
                                        {treeEntry.entryKind === "folder"
                                            ? `${treeEntry.displayName}/`
                                            : treeEntry.displayName}
                                    </span>
                                    {treeEntry.relativePath === editorController.entryFilePath && (
                                        <span className="project-tree-entry-marker">ENTRY</span>
                                    )}
                                    {treeEntry.entryKind === "file" && (
                                        <span className="project-tree-language">
                                            {treeEntry.languageLabel}
                                        </span>
                                    )}
                                    {treeEntry.entryKind === "file" &&
                                        editorController.isDirty(treeEntry.relativePath) && (
                                            <span
                                                className="project-tree-dirty-marker"
                                                aria-hidden="true"
                                            >
                                                {"*"}
                                            </span>
                                        )}
                                </button>
                            ))
                        )}
                    </div>
                    <div className="project-editor-pane" ref={editorHostReference} />
                </div>
                <div className="project-editor-build-bar">
                    <span className="project-editor-build-summary">
                        {editorController.fileCount}{" "}
                        {editorController.fileCount === 1 ? "file" : "files"} · entry{" "}
                        {editorController.entryFilePath.length > 0
                            ? editorController.entryFilePath
                            : "not set"}
                    </span>
                    <button
                        className="project-action-button"
                        type="button"
                        disabled={!canBuildAndRun}
                        onClick={handleBuildAndRun}
                    >
                        {submissionInFlight ? "Building" : "Build and Run"}
                    </button>
                </div>
            </div>
        </section>
    );
}
export { CodeProjectEditorView };
