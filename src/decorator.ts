'use strict';

import { TextEditor, window, TextEditorDecorationType, Range, ThemeColor } from "vscode";
import { DisassemblyDocument } from "./document";

export class DisassemblyDecorator {

    private sourceEditor: TextEditor;
    private disassemblyEditor: TextEditor;
    private disassemblyDocument: DisassemblyDocument;
    private selectedLineDecorationType: TextEditorDecorationType;
    private unusedLineDecorationType: TextEditorDecorationType;

    // mappings from source lines to assembly lines
    private mappings = new Map<number, number[]>();

    constructor(sourceEditor: TextEditor, disassemblyEditor: TextEditor, disassemblyDocument: DisassemblyDocument) {
        this.sourceEditor = sourceEditor;
        this.disassemblyEditor = disassemblyEditor;
        this.disassemblyDocument = disassemblyDocument;

        this.selectedLineDecorationType = window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
            overviewRulerColor: new ThemeColor('editorOverviewRuler.findMatchForeground')
        });

        this.unusedLineDecorationType = window.createTextEditorDecorationType({
            opacity: '0.5'
        });

        this.dimUnusedSourceLines();

        this.disassemblyDocument.sourceToAsmMapping.then(mappings => {
            this.mappings = mappings;
            this.dimUnusedSourceLines();
        });
    }

    dispose() {
        this.selectedLineDecorationType.dispose();
        this.unusedLineDecorationType.dispose();
    }

    update() {
        if (window.activeTextEditor === this.sourceEditor) {
            this.highlightSourceLine(this.sourceEditor.selection.start.line);
        } else if (window.activeTextEditor === this.disassemblyEditor) {
            this.highlightDisassemblyLine(this.disassemblyEditor.selection.start.line);
        }
    }

    private dimUnusedSourceLines() {
        const unusedSourceLines: Range[] = [];
        for (let line = 0; line < this.sourceEditor.document.lineCount; line++) {
            if (this.mappings.get(line) === undefined) {
                unusedSourceLines.push(this.sourceEditor.document.lineAt(line).range);
            }
        }
        this.sourceEditor.setDecorations(this.unusedLineDecorationType, unusedSourceLines);
    }

    private highlightSourceLine(line: number) {
        const sourceLineRange = this.sourceEditor.document.lineAt(line).range;
        this.sourceEditor.setDecorations(this.selectedLineDecorationType, [sourceLineRange]);

        const asmLinesRanges: Range[] = [];
        let mapped = this.mappings.get(line);
        if (mapped !== undefined) {
            mapped.forEach(line => {
                asmLinesRanges.push(this.disassemblyEditor.document.lineAt(line).range);
            });
        }
        this.disassemblyEditor.setDecorations(this.selectedLineDecorationType, asmLinesRanges);

        if (asmLinesRanges.length > 0) {
            let lineVisible = this.disassemblyEditor.visibleRanges.some(range =>
                range.contains(asmLinesRanges[0])
            );
            if (!lineVisible) {
                this.disassemblyEditor.revealRange(asmLinesRanges[0]);
            }
        }
    }

    private highlightDisassemblyLine(line: number) {
        let asmLine = this.disassemblyDocument.lines[line - 1];

        const asmLineRange = this.disassemblyEditor.document.lineAt(line).range;
        this.disassemblyEditor.setDecorations(this.selectedLineDecorationType, [asmLineRange]);

        if (asmLine.source !== undefined) {
            const sourceLineRange = this.sourceEditor.document.lineAt(asmLine.source.line - 1).range;
            this.sourceEditor.setDecorations(this.selectedLineDecorationType, [sourceLineRange]);
            this.sourceEditor.revealRange(sourceLineRange);
        } else {
            this.sourceEditor.setDecorations(this.selectedLineDecorationType, []);
        }
    }

}
