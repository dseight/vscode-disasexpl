'use strict';

import { workspace, Uri, EventEmitter } from 'vscode';
import { AsmParser, AsmLine, AsmFilter, BinaryAsmLine } from './asm';

export class AsmDocument {

    private _uri: Uri;
    private _emitter: EventEmitter<Uri>;
    lines: AsmLine[] = [];
    sourceToAsmMapping = new Map<number, number[]>();

    constructor(uri: Uri, emitter: EventEmitter<Uri>) {
        this._uri = uri;

        // The AsmDocument has access to the event emitter from
        // the containg provider. This allows it to signal changes
        this._emitter = emitter;

        const useBinaryParsing = workspace.getConfiguration('', uri.with({scheme: 'file'}))
            .get('disasexpl.useBinaryParsing', false);

        workspace.openTextDocument(this._uri.with({ scheme: 'file' })).then(doc => {
            const filter = new AsmFilter();
            filter.binary = useBinaryParsing;
            this.lines = new AsmParser().process(doc.getText(), filter);
        }, err => {
            this.lines = [new AsmLine(`Failed to load file '${this._uri.path}'`, undefined)];
        }).then(_ => {
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
            if (line instanceof BinaryAsmLine) {
                let address = ("0000000" + line.address.toString(16)).substr(-8);
                result += `<${address}> ${line.text}\n`;
            } else {
                result += line.text + '\n';
            }
        });
        return result;
    }

}
