'use strict';

import { workspace, window, commands, ExtensionContext, Disposable } from 'vscode';
import { DisassemblyProvider, encodeDisassemblyUri } from './provider';
import { DisassemblyDecorator } from './decorator';

export function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('disasexpl now active');

    const provider = new DisassemblyProvider();

    // register content provider for scheme `disassembly`
    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(DisassemblyProvider.scheme, provider),
    );

    // register command that crafts an uri with the `disassembly` scheme,
    // open the dynamic document, and shows it in the next editor
    const commandRegistration = commands.registerTextEditorCommand('editor.showDisassembly', sourceEditor => {
        let asmUri = encodeDisassemblyUri(sourceEditor.document.uri);

        return workspace.openTextDocument(asmUri).then(doc => {
            window.showTextDocument(doc, sourceEditor.viewColumn! + 1).then( disassemblyEditor => {
                const disassemblyDocument = provider.provideDisassemblyDocument(asmUri);
                const decorator = new DisassemblyDecorator(sourceEditor, disassemblyEditor, disassemblyDocument);

                window.onDidChangeTextEditorSelection(e => {
                    if (e.selections.length > 1) {
                        return;
                    }
                    let selection = e.selections[0];
                    if (!selection.isSingleLine) {
                        return;
                    }
                    if (e.textEditor === sourceEditor) {
                        decorator.highlightSourceLine(selection.start.line);
                    } else if (e.textEditor === disassemblyEditor) {
                        decorator.highlightDisassemblyLine(selection.start.line);
                    }
                });
            });
        });
    });

    context.subscriptions.push(
        provider,
        commandRegistration,
        providerRegistrations
    );
}
