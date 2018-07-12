'use strict';

import * as vscode from 'vscode';
import { AsmParser, AsmLine, AsmFilter } from './asm';

export class DisassemblyDocument {

    private _uri: vscode.Uri;
    private _emitter: vscode.EventEmitter<vscode.Uri>;
    private _watcher: vscode.FileSystemWatcher;
    lines: AsmLine[] = [];
    sourceToAsmMapping: Thenable<Map<number, number[]>>;

    constructor(uri: vscode.Uri, emitter: vscode.EventEmitter<vscode.Uri>) {
        this._uri = uri;

        // The DisassemblyDocument has access to the event emitter from
        // the containg provider. This allows it to signal changes
        this._emitter = emitter;

        this.load();

        this._watcher = vscode.workspace.createFileSystemWatcher(uri.path);
        this._watcher.onDidChange(_ => this.load());
        this._watcher.onDidCreate(_ => this.load());
        this._watcher.onDidDelete(_ => this.load());
    }

    dispose() {
        this._watcher.dispose();
    }

    private load() {
        this.sourceToAsmMapping = vscode.workspace.openTextDocument(this._uri.with({ scheme: 'file' })).then(doc => {
            this.lines = new AsmParser().process(doc.getText(), new AsmFilter());
            this._emitter.fire(this._uri);
        }, err => {
            this.lines = [new AsmLine(`Failed to load file '${this._uri.path}'`, undefined)];
            this._emitter.fire(this._uri);
        }).then( _ => {
            let mapping = new Map<number, number[]>();
            this.lines.forEach((line, index) => {
                if (line.source === undefined) {
                    return;
                }
                let sourceLine = line.source.line - 1;
                if (mapping.get(sourceLine) === undefined) {
                    mapping.set(sourceLine, []);
                }
                mapping.get(sourceLine)!.push(index);
            });
            return mapping;
        });
    }

    get value(): string {
        let result = '';
        this.lines.forEach(line => {
            result += line.text + '\n';
        });
        return result;
    }

}
