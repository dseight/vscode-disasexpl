'use strict';

import { TextEditor, window, TextEditorDecorationType, Range, ThemeColor, workspace, Uri, Disposable, TextEditorRevealType } from "vscode";
import { AsmProvider } from "./provider";
import { AsmDocument } from "./document";

export class AsmDecorator {

    private srcEditor: TextEditor;
    private asmEditor: TextEditor;
    private provider: AsmProvider;
    private selectedLineDecorationType: TextEditorDecorationType;
    private unusedLineDecorationType: TextEditorDecorationType;
    private disposable: Disposable;
    private document: AsmDocument;

    // mappings from source lines to assembly lines
    private mappings = new Map<number, number[]>();

    constructor(srcEditor: TextEditor, asmEditor: TextEditor, provider: AsmProvider) {
        this.srcEditor = srcEditor;
        this.asmEditor = asmEditor;
        this.provider = provider;

        this.selectedLineDecorationType = window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
            overviewRulerColor: new ThemeColor('editorOverviewRuler.findMatchForeground')
        });

        this.unusedLineDecorationType = window.createTextEditorDecorationType({
            opacity: '0.5'
        });

        const uri = asmEditor.document.uri;
        const providerEventRegistration = provider.onDidChange(changedUri => {
            if (changedUri.toString() === uri.toString()) {
                this.load(uri);
            }
        });
        this.load(uri);

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
        this.document = this.provider.provideAsmDocument(uri);
        this.mappings = this.document.sourceToAsmMapping;

        const dimUnused = workspace.getConfiguration('', this.srcEditor.document.uri)
            .get('disasexpl.dimUnusedSourceLines', true);

        if (dimUnused) {
            this.dimUnusedSourceLines();
        }
    }

    update() {
        if (window.activeTextEditor === this.srcEditor) {
            this.srcLineSelected(this.srcEditor.selection.start.line);
        } else if (window.activeTextEditor === this.asmEditor) {
            this.asmLineSelected(this.asmEditor.selection.start.line);
        }
    }

    private dimUnusedSourceLines() {
        const unusedSourceLines: Range[] = [];
        for (let line = 0; line < this.srcEditor.document.lineCount; line++) {
            if (this.mappings.get(line) === undefined) {
                unusedSourceLines.push(this.srcEditor.document.lineAt(line).range);
            }
        }
        this.srcEditor.setDecorations(this.unusedLineDecorationType, unusedSourceLines);
    }

    private srcLineSelected(line: number) {
        const sourceLineRange = this.srcEditor.document.lineAt(line).range;
        this.srcEditor.setDecorations(this.selectedLineDecorationType, [sourceLineRange]);

        const asmLinesRanges: Range[] = [];
        let mapped = this.mappings.get(line);
        if (mapped !== undefined) {
            mapped.forEach(line => {
                if (line >= this.asmEditor.document.lineCount) {
                    return;
                }
                asmLinesRanges.push(this.asmEditor.document.lineAt(line).range);
            });
        }
        this.asmEditor.setDecorations(this.selectedLineDecorationType, asmLinesRanges);

        if (asmLinesRanges.length > 0) {
            this.asmEditor.revealRange(asmLinesRanges[0], TextEditorRevealType.InCenterIfOutsideViewport);
        }
    }

    private asmLineSelected(line: number) {
        let asmLine = this.document.lines[line];

        const asmLineRange = this.asmEditor.document.lineAt(line).range;
        this.asmEditor.setDecorations(this.selectedLineDecorationType, [asmLineRange]);

        if (asmLine.source !== undefined) {
            const sourceLineRange = this.srcEditor.document.lineAt(asmLine.source.line - 1).range;
            this.srcEditor.setDecorations(this.selectedLineDecorationType, [sourceLineRange]);
            this.srcEditor.revealRange(sourceLineRange, TextEditorRevealType.InCenterIfOutsideViewport);
        } else {
            this.srcEditor.setDecorations(this.selectedLineDecorationType, []);
        }
    }

}
