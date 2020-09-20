'use strict';

import { workspace, languages, Uri, FileSystemWatcher, EventEmitter, TextDocumentContentProvider } from 'vscode';
import * as Path from 'path';
import { AsmDocument } from './document';

export class AsmProvider implements TextDocumentContentProvider {

    static scheme = 'disassembly';

    private _documents = new Map<string, AsmDocument>();
    private _watchers = new Map<string, FileSystemWatcher>();
    private _onDidChange = new EventEmitter<Uri>();

    provideTextDocumentContent(uri: Uri): string | Thenable<string> {
        let document = this.provideAsmDocument(uri);
        return document.value;
    }

    provideAsmDocument(uri: Uri): AsmDocument {
        // already loaded?
        let document = this._documents.get(uri.toString());
        if (document) {
            return document;
        }

        document = new AsmDocument(uri, this._onDidChange);
        this._documents.set(uri.toString(), document);

        // Watch for assembly file and reload it on change
        let watcher = workspace.createFileSystemWatcher(uri.path);
        watcher.onDidChange(fileUri => this.reloadAsmDocument(fileUri));
        watcher.onDidCreate(fileUri => this.reloadAsmDocument(fileUri));
        watcher.onDidDelete(fileUri => this.reloadAsmDocument(fileUri));
        this._watchers.set(uri.toString(), watcher);

        return document;
    }

    reloadAsmDocument(fileUri: Uri) {
        const uri = fileUri.with({ scheme: AsmProvider.scheme });
        const document = new AsmDocument(uri, this._onDidChange);
        this._documents.set(uri.toString(), document);
        this._onDidChange.fire(uri);
    }

    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    get onDidChange() {
        return this._onDidChange.event;
    }

    dispose() {
        this._watchers.forEach(watcher => watcher.dispose());
        this._documents.clear();
        this._onDidChange.dispose();
    }

}

export function encodeAsmUri(uri: Uri): Uri {
    const configuration = workspace.getConfiguration('', uri);
    const associations: any = configuration.get('disasexpl.associations');

    // by default just replace file extension with '.S'
    let defaultUri = uri.with({
        scheme: AsmProvider.scheme,
        path: pathWithoutExtension(uri.path) + '.S'
    });

    if (associations === undefined) {
        return defaultUri;
    }

    for (let key in associations) {
        // that's a nasty way to get the doc...
        let doc = workspace.textDocuments.find(doc => doc.uri === uri);
        if (doc === undefined) {
            continue;
        }
        let match = languages.match({ pattern: key }, doc);
        if (match > 0) {
            let associated = associations[key];
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

    let parsedFilePath = Path.parse(path);
    let workspacePath = workspace.workspaceFolders[0].uri.fsPath;

    let variables: any = {
        // the path of the folder opened in VS Code
        'workspaceFolder': workspacePath,
        // the name of the folder opened in VS Code without any slashes (/)
        'workspaceFolderBasename': Path.parse(workspacePath).name,
        // the current opened file
        'file': path,
        // the current opened file relative to workspaceFolder
        'relativeFile': Path.relative(workspacePath, path),
        // the current opened file's basename
        'fileBasename': parsedFilePath.base,
        // the current opened file's basename with no file extension
        'fileBasenameNoExtension': parsedFilePath.name,
        // the current opened file's dirname
        'fileDirname': parsedFilePath.dir,
        // the current opened file's extension
        'fileExtname': parsedFilePath.ext,
        // the relative directory, so one can use it in settings as:
        // "**/*.c": "${workspaceFolder}/.o/${relativeFileDir}/${fileBasenameNoExtension}.s"
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
