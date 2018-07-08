'use strict';

import { TextEditor, window, TextEditorDecorationType, Range } from "vscode";
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

    dispose() {
        this.selectedLineDecorationType.dispose();
    }

    update() {
        if (window.activeTextEditor === this.sourceEditor) {
            this.highlightSourceLine(this.sourceEditor.selection.start.line);
        } else if (window.activeTextEditor === this.disassemblyEditor) {
            this.highlightDisassemblyLine(this.disassemblyEditor.selection.start.line);
        }
    }

    private highlightSourceLine(line: number) {
        const sourceLineRange = this.sourceEditor.document.lineAt(line).range;
        this.sourceEditor.setDecorations(this.selectedLineDecorationType, [sourceLineRange]);

        const asmLinesRanges: Range[] = [];
        this.disassemblyDocument.lines.forEach((asmLine, index) => {
            if (asmLine.source === undefined || asmLine.source.line !== line + 1) {
                return;
            }
            asmLinesRanges.push(this.disassemblyEditor.document.lineAt(index).range);
        });
        this.disassemblyEditor.setDecorations(this.selectedLineDecorationType, asmLinesRanges);
    }

    private highlightDisassemblyLine(line: number) {
        let asmLine = this.disassemblyDocument.lines[line - 1];

        const asmLineRange = this.disassemblyEditor.document.lineAt(line).range;
        this.disassemblyEditor.setDecorations(this.selectedLineDecorationType, [asmLineRange]);

        if (asmLine.source !== undefined) {
            const sourceLineRange = this.sourceEditor.document.lineAt(asmLine.source.line - 1).range;
            this.sourceEditor.setDecorations(this.selectedLineDecorationType, [sourceLineRange]);
        } else {
            this.sourceEditor.setDecorations(this.selectedLineDecorationType, []);
        }
    }

}
