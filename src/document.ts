'use strict';

import { workspace, Uri, EventEmitter } from 'vscode';
import { AsmParser, AsmLine, AsmFilter } from './asm';

export class DisassemblyDocument {

    private _uri: Uri;
    private _emitter: EventEmitter<Uri>;
    lines: AsmLine[] = [];
    sourceToAsmMapping = new Map<number, number[]>();

    constructor(uri: Uri, emitter: EventEmitter<Uri>) {
        this._uri = uri;

        // The DisassemblyDocument has access to the event emitter from
        // the containg provider. This allows it to signal changes
        this._emitter = emitter;

        workspace.openTextDocument(this._uri.with({ scheme: 'file' })).then(doc => {
            this.lines = new AsmParser().process(doc.getText(), new AsmFilter());
        }, err => {
            this.lines = [new AsmLine(`Failed to load file '${this._uri.path}'`, undefined)];
        }).then( _ => {
            let mapping = this.sourceToAsmMapping;
            mapping.clear();

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

            this._emitter.fire(this._uri);
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
