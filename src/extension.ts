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
    const providerRegistration =
        workspace.registerTextDocumentContentProvider(DisassemblyProvider.scheme, provider);

    // register command that crafts an uri with the `disassembly` scheme,
    // open the dynamic document, and shows it in the next editor
    const commandRegistration = commands.registerTextEditorCommand('editor.showDisassembly', sourceEditor => {
        let asmUri = encodeDisassemblyUri(sourceEditor.document.uri);

        workspace.openTextDocument(asmUri).then(doc => {
            window.showTextDocument(doc, sourceEditor.viewColumn! + 1, true).then( disassemblyEditor => {
                const decorator = new DisassemblyDecorator(sourceEditor, disassemblyEditor, provider);
                const registrations = Disposable.from(
                    decorator,
                    window.onDidChangeTextEditorSelection( _ => decorator.update()),
                    window.onDidChangeVisibleTextEditors(editors => {
                        // decorations are useless if one of editors become invisible
                        if (editors.indexOf(sourceEditor) === -1 || editors.indexOf(disassemblyEditor) === -1) {
                            registrations.dispose();
                        }
                    })
                );
                // dirty way to get decorations work right after showing disassembly
                setTimeout(_ => decorator.update(), 300);
            });
        });
    });

    context.subscriptions.push(
        provider,
        commandRegistration,
        providerRegistration
    );
}
