'use strict';

import { workspace, languages, Uri, EventEmitter, TextDocumentContentProvider, Event } from 'vscode';
import * as Path from 'path';
import { AsmDocument } from './document';

export class AsmProvider implements TextDocumentContentProvider {

    static scheme = 'disassembly';

    private _documents = new Map<string, AsmDocument>();
    private _onDidChange = new EventEmitter<Uri>();

    provideTextDocumentContent(uri: Uri): string | Thenable<string> {
        const document = this.provideAsmDocument(uri);
        return document.value;
    }

    provideAsmDocument(uri: Uri): AsmDocument {
        let document = this._documents.get(uri.path);

        if (!document) {
            document = new AsmDocument(uri, this._onDidChange);
            this._documents.set(uri.path, document);
        }

        return document;
    }

    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    dispose(): void {
        this._documents.clear();
        this._onDidChange.dispose();
    }

}

export function encodeAsmUri(uri: Uri): Uri {
    const configuration = workspace.getConfiguration('', uri);

    type Associations = Record<string, string>;
    const associations = configuration.get<Associations>('disasexpl.associations');

    // by default just replace file extension with '.S'
    const defaultUri = uri.with({
        scheme: AsmProvider.scheme,
        path: pathWithoutExtension(uri.path) + '.S'
    });

    if (associations === undefined) {
        return defaultUri;
    }

    for (const key in associations) {
        // that's a nasty way to get the doc...
        const doc = workspace.textDocuments.find(doc => doc.uri === uri);
        if (doc === undefined) {
            continue;
        }
        const match = languages.match({ pattern: key }, doc);
        if (match > 0) {
            const associated = associations[key];
            return uri.with({
                scheme: AsmProvider.scheme,
                path: resolvePath(uri.fsPath, associated)
            });
        }
    }

    return defaultUri;
}

/**
 * Remove extension from provided path.
 */
function pathWithoutExtension(path: string): string {
    return path.slice(0, path.lastIndexOf('.')) || path;
}

// Resolve path with almost all variable substitution that supported in
// Debugging and Task configuration files
function resolvePath(path: string, associated: string): string {
    if (workspace.workspaceFolders === undefined) {
        return path;
    }

    const parsedFilePath = Path.parse(path);
    const workspacePath = workspace.workspaceFolders[0].uri.fsPath;

    const variables: Record<string, string> = {
        // the path of the folder opened in VS Code
        'workspaceFolder': workspacePath,
        // the name of the folder opened in VS Code without any slashes (/)
        'workspaceFolderBasename': Path.parse(workspacePath).name,
        // the current opened file
        'file': path,
        // the current opened file's workspace folder
        'fileWorkspaceFolder': workspace.getWorkspaceFolder(Uri.file(path))?.uri.fsPath || '',
        // the current opened file relative to workspaceFolder
        'relativeFile': Path.relative(workspacePath, path),
        // the current opened file's dirname relative to workspaceFolder
        'relativeFileDirname': Path.relative(workspacePath, parsedFilePath.dir),
        // the current opened file's basename
        'fileBasename': parsedFilePath.base,
        // the current opened file's basename with no file extension
        'fileBasenameNoExtension': parsedFilePath.name,
        // the current opened file's dirname
        'fileDirname': parsedFilePath.dir,
        // the current opened file's extension
        'fileExtname': parsedFilePath.ext,
        // the character used by the operating system to separate components in file paths
        'pathSeparator': Path.sep,
        // same as relativeFileDirname, kept for compatibility with old configs
        // TODO: remove in future releases
        'relativeFileDir': Path.relative(workspacePath, parsedFilePath.dir),
    };

    const variablesRe = /\$\{(.*?)\}/g;
    const resolvedPath = associated.replace(variablesRe, (match: string, name: string) => {
        const value = variables[name];
        if (value !== undefined) {
            return value;
        } else {
            // leave original (unsubstituted) value if there is no such variable
            return match;
        }
    });

    // normalize a path, reducing '..' and '.' parts
    return Path.normalize(resolvedPath);
}
