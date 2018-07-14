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
    private registrations: Disposable;
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
        // rebuild decorations on asm document change
        const providerEventRegistration = provider.onDidChange(changedUri => {
            if (changedUri.toString() === uri.toString()) {
                this.load(uri);
            }
        });
        this.load(uri);

        this.registrations = Disposable.from(
            this.selectedLineDecorationType,
            this.unusedLineDecorationType,
            providerEventRegistration,
            window.onDidChangeTextEditorSelection(e => {
                this.updateSelection(e.textEditor);
            }),
            window.onDidChangeVisibleTextEditors(editors => {
                // decorations are useless if one of editors become invisible
                if (editors.indexOf(srcEditor) === -1 || editors.indexOf(asmEditor) === -1) {
                    this.dispose();
                }
            })
        );
    }

    dispose() {
        this.registrations.dispose();
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

    updateSelection(editor: TextEditor) {
        if (editor === this.srcEditor) {
            this.srcLineSelected(this.srcEditor.selection.start.line);
        } else if (editor === this.asmEditor) {
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
        const srcLineRange = this.srcEditor.document.lineAt(line).range;
        this.srcEditor.setDecorations(this.selectedLineDecorationType, [srcLineRange]);

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
            const srcLineRange = this.srcEditor.document.lineAt(asmLine.source.line - 1).range;
            this.srcEditor.setDecorations(this.selectedLineDecorationType, [srcLineRange]);
            this.srcEditor.revealRange(srcLineRange, TextEditorRevealType.InCenterIfOutsideViewport);
        } else {
            this.srcEditor.setDecorations(this.selectedLineDecorationType, []);
        }
    }

}
