'use strict';

import { workspace, window, commands, ExtensionContext } from 'vscode';
import { AsmProvider, getAsmUri } from './provider';
import { AsmDecorator } from './decorator';

export function activate(context: ExtensionContext): void {
    const provider = new AsmProvider();

    // register content provider for scheme `disassembly`
    const providerRegistration =
        workspace.registerTextDocumentContentProvider(AsmProvider.scheme, provider);

    // register command that crafts an uri with the `disassembly` scheme,
    // open the dynamic document, and shows it in the next editor
    const commandRegistration = commands.registerTextEditorCommand('disasexpl.show', srcEditor => {
        const asmUri = getAsmUri(srcEditor.document);

        const options = {
            viewColumn: srcEditor.viewColumn! + 1,
            preserveFocus: true,
        };

        window.showTextDocument(asmUri, options).then(asmEditor => {
            const decorator = new AsmDecorator(srcEditor, asmEditor, provider);
            // dirty way to get decorations work after showing disassembly
            setTimeout(() => decorator.updateSelection(srcEditor), 500);
        });
    });

    context.subscriptions.push(
        provider,
        commandRegistration,
        providerRegistration
    );
}
