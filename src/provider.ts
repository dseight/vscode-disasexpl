'use strict';

import * as vscode from 'vscode';
import * as Path from 'path';
import { DisassemblyDocument } from './document';

export class DisassemblyProvider implements vscode.TextDocumentContentProvider {

    static scheme = 'disassembly';

    private _documents = new Map<string, DisassemblyDocument>();
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        let document = this.provideDisassemblyDocument(uri);
        return document.value;
    }

    provideDisassemblyDocument(uri: vscode.Uri): DisassemblyDocument {
        // already loaded?
        let document = this._documents.get(uri.toString());
        if (document) {
            return document;
        }

        document = new DisassemblyDocument(uri, this._onDidChange);
        this._documents.set(uri.toString(), document);

        return document;
    }

    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    get onDidChange() {
        return this._onDidChange.event;
    }

    dispose() {
        this._documents.forEach(doc => doc.dispose());
        this._documents.clear();
        this._onDidChange.dispose();
    }

}

export function encodeDisassemblyUri(uri: vscode.Uri): vscode.Uri {
    const configuration = vscode.workspace.getConfiguration('', uri);
    const associations: any = configuration.get('disasexpl.associations');

    // by default just replace file extension with '.S'
    let defaultUri = uri.with({
        scheme: DisassemblyProvider.scheme,
        path: (uri.path.slice(0, uri.path.lastIndexOf('.')) || uri.path) + '.S'
    });

    if (associations === undefined) {
        return defaultUri;
    }

    for (let key in associations) {
        // that's a nasty way to get the doc...
        let doc = vscode.workspace.textDocuments.find(doc => doc.uri === uri);
        if (doc === undefined) {
            continue;
        }
        let match = vscode.languages.match({pattern: key}, doc);
        if (match > 0) {
            let associated = associations[key];
            return uri.with({
                scheme: DisassemblyProvider.scheme,
                path: resolvePath(uri.path, associated)
            });
        }
    }

    return defaultUri;
}

// Resolve path with almost all variable substitution that supported in
// Debugging and Task configuration files
function resolvePath(path: string, associated: string): string {
    if (vscode.workspace.workspaceFolders === undefined) {
        return path;
    }

    let parsedFilePath = Path.parse(path);
    let parsedWorkspacePath = Path.parse(vscode.workspace.workspaceFolders[0].uri.path);

    let variables: any = {
        // the path of the folder opened in VS Code
        'workspaceFolder': parsedWorkspacePath.dir,
        // the name of the folder opened in VS Code without any slashes (/)
        'workspaceFolderBasename': parsedWorkspacePath.name,
        // the current opened file
        'file': path,
        // the current opened file relative to workspaceFolder
        'relativeFile': Path.relative(parsedWorkspacePath.dir, path),
        // the current opened file's basename
        'fileBasename': parsedFilePath.base,
        // the current opened file's basename with no file extension
        'fileBasenameNoExtension': parsedFilePath.name,
        // the current opened file's dirname
        'fileDirname': parsedFilePath.dir,
        // the current opened file's extension
        'fileExtname': parsedFilePath.ext,
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
