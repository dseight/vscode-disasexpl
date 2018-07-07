'use strict';

import * as vscode from 'vscode';
import { DisassemblyDocument } from './document';

export class DisassemblyProvider implements vscode.TextDocumentContentProvider {

    static scheme = 'disassembly';

    private _documents = new Map<string, DisassemblyDocument>();
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
        // already loaded?
        let document = this._documents.get(uri.toString());
        if (document) {
            return document.value;
        }

        document = new DisassemblyDocument(uri, this._onDidChange);
        this._documents.set(uri.toString(), document);

        return document.value;
    }

    // Expose an event to signal changes of _virtual_ documents
    // to the editor
    get onDidChange() {
        return this._onDidChange.event;
    }

    dispose() {
        this._documents.clear();
        this._onDidChange.dispose();
    }

}

export function encodeDisassemblyUri(uri: vscode.Uri): vscode.Uri {
    return uri.with({
        scheme: DisassemblyProvider.scheme,
        path: uri.path.replace(/\.c$/, '.gcc.S')
    });
}
