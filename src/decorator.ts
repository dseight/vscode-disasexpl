'use strict';

import { TextEditor, window, TextEditorDecorationType, DecorationOptions } from "vscode";
import { DisassemblyDocument } from "./document";

export class DisassemblyDecorator {

    private sourceEditor: TextEditor;
    private disassemblyEditor: TextEditor;
    private disassemblyDocument: DisassemblyDocument;
    private selectedLineDecorationType: TextEditorDecorationType;

    constructor(sourceEditor: TextEditor, disassemblyEditor: TextEditor, disassemblyDocument: DisassemblyDocument) {
        this.sourceEditor = sourceEditor;
        this.disassemblyEditor = disassemblyEditor;
        this.disassemblyDocument = disassemblyDocument;

        this.selectedLineDecorationType = window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255,0,0,0.25)',
            isWholeLine: true
        });
    }

    highlightSourceLine(line: number) {
        const sourceLineRange = this.sourceEditor.document.lineAt(line).range;
        const sourceLinesDecorations: DecorationOptions[] = [{range: sourceLineRange}];
        this.sourceEditor.setDecorations(this.selectedLineDecorationType, sourceLinesDecorations);

        const asmLinesDecorations: DecorationOptions[] = [];
        this.disassemblyDocument.lines.forEach((asmLine, index) => {
            if (asmLine.source === undefined || asmLine.source.line !== line + 1) {
                return;
            }
            let asmLineRange = this.disassemblyEditor.document.lineAt(index).range;
            asmLinesDecorations.push({range: asmLineRange});
        });
        this.disassemblyEditor.setDecorations(this.selectedLineDecorationType, asmLinesDecorations);
    }

    highlightDisassemblyLine(line: number) {
        let asmLine = this.disassemblyDocument.lines[line - 1];

        const asmLineRange = this.disassemblyEditor.document.lineAt(line).range;
        const asmLinesDecorations: DecorationOptions[] = [{range: asmLineRange}];
        this.disassemblyEditor.setDecorations(this.selectedLineDecorationType, asmLinesDecorations);

        if (asmLine.source !== undefined) {
            const sourceLineRange = this.sourceEditor.document.lineAt(asmLine.source.line - 1).range;
            const sourceLinesDecorations: DecorationOptions[] = [{range: sourceLineRange}];
            this.sourceEditor.setDecorations(this.selectedLineDecorationType, sourceLinesDecorations);
        } else {
            this.sourceEditor.setDecorations(this.selectedLineDecorationType, []);
        }
    }

}
