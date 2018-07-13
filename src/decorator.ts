'use strict';

import { TextEditor, window, TextEditorDecorationType, Range, ThemeColor, workspace, Uri, Disposable } from "vscode";
import { DisassemblyProvider } from "./provider";
import { DisassemblyDocument } from "./document";

export class DisassemblyDecorator {

    private sourceEditor: TextEditor;
    private disassemblyEditor: TextEditor;
    private provider: DisassemblyProvider;
    private selectedLineDecorationType: TextEditorDecorationType;
    private unusedLineDecorationType: TextEditorDecorationType;
    private disposable: Disposable;
    private document: DisassemblyDocument;

    // mappings from source lines to assembly lines
    private mappings = new Map<number, number[]>();

    constructor(sourceEditor: TextEditor, disassemblyEditor: TextEditor, provider: DisassemblyProvider) {
        this.sourceEditor = sourceEditor;
        this.disassemblyEditor = disassemblyEditor;
        this.provider = provider;

        this.selectedLineDecorationType = window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
            overviewRulerColor: new ThemeColor('editorOverviewRuler.findMatchForeground')
        });

        this.unusedLineDecorationType = window.createTextEditorDecorationType({
            opacity: '0.5'
        });

        const uri = disassemblyEditor.document.uri;
        const providerEventRegistration = provider.onDidChange(changedUri => {
            if (changedUri.toString() === uri.toString()) {
                this.load(uri);
            }
        });

        this.disposable = Disposable.from(
            this.selectedLineDecorationType,
            this.unusedLineDecorationType,
            providerEventRegistration,
        );
    }

    dispose() {
        this.disposable.dispose();
    }

    load(uri: Uri) {
        this.document = this.provider.provideDisassemblyDocument(uri);
        this.mappings = this.document.sourceToAsmMapping;

        const dimUnused = workspace.getConfiguration('', this.sourceEditor.document.uri)
            .get('disasexpl.dimUnusedSourceLines', true);

        if (dimUnused) {
            this.dimUnusedSourceLines();
        }
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
        let asmLine = this.document.lines[line - 1];

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
