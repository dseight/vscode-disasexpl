'use strict';

import { workspace, Uri, EventEmitter, FileSystemWatcher } from 'vscode';
import { AsmParser, AsmLine, AsmFilter } from './asm';

export class AsmDocument {

    private _uri: Uri;
    private _emitter: EventEmitter<Uri>;
    private _watcher: FileSystemWatcher;
    lines: AsmLine[] = [];
    sourceToAsmMapping = new Map<number, number[]>();

    constructor(uri: Uri, emitter: EventEmitter<Uri>) {
        this._uri = uri;

        // The AsmDocument has access to the event emitter from
        // the containg provider. This allows it to signal changes
        this._emitter = emitter;

        // Watch for underlying assembly file and reload it on change
        workspace.onDidChangeTextDocument(e => { if (e.document.uri.path === this._uri.path) this.update(); });
        workspace.onDidDeleteFiles(e => e.files.forEach(f => { if (uri.path.includes(f.path)) this.update(); }));

        this._watcher = workspace.createFileSystemWatcher(uri.path);
        this._watcher.onDidChange(() => this.update());
        this._watcher.onDidCreate(() => this.update());
        this._watcher.onDidDelete(() => this.update());

        this.update();
    }

    private update() {
        const useBinaryParsing = workspace.getConfiguration('', this._uri.with({scheme: 'file'}))
            .get('disasexpl.useBinaryParsing', false);

        workspace.openTextDocument(this._uri.with({ scheme: 'file' })).then(doc => {
            const filter = new AsmFilter();
            filter.binary = useBinaryParsing;
            this.lines = new AsmParser().process(doc.getText(), filter).asm;
        }, () => {
            this.lines = [new AsmLine(`Failed to load file '${this._uri.path}'`, undefined, [])];
        }).then(() => this._emitter.fire(this._uri));
    }

    get value(): string {
        return this.lines.reduce((result, line) => result += line.value, '');
    }

    dispose(): void {
        this._watcher.dispose();
    }

}
