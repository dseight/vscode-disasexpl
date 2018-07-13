'use strict';

import { workspace, window, commands, ExtensionContext, Disposable } from 'vscode';
import { AsmProvider, encodeAsmUri } from './provider';
import { AsmDecorator } from './decorator';

export function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('disasexpl now active');

    const provider = new AsmProvider();

    // register content provider for scheme `disassembly`
    const providerRegistration =
        workspace.registerTextDocumentContentProvider(AsmProvider.scheme, provider);

    // register command that crafts an uri with the `disassembly` scheme,
    // open the dynamic document, and shows it in the next editor
    const commandRegistration = commands.registerTextEditorCommand('editor.showDisassembly', srcEditor => {
        let asmUri = encodeAsmUri(srcEditor.document.uri);

        workspace.openTextDocument(asmUri).then(doc => {
            window.showTextDocument(doc, srcEditor.viewColumn! + 1, true).then( asmEditor => {
                const decorator = new AsmDecorator(srcEditor, asmEditor, provider);
                const registrations = Disposable.from(
                    decorator,
                    window.onDidChangeTextEditorSelection( _ => decorator.update()),
                    window.onDidChangeVisibleTextEditors(editors => {
                        // decorations are useless if one of editors become invisible
                        if (editors.indexOf(srcEditor) === -1 || editors.indexOf(asmEditor) === -1) {
                            registrations.dispose();
                        }
                    })
                );
                // dirty way to get decorations work after showing disassembly
                setTimeout(_ => decorator.update(), 500);
            });
        });
    });

    context.subscriptions.push(
        provider,
        commandRegistration,
        providerRegistration
    );
}
