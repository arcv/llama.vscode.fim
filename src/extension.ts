import * as vscode from 'vscode';
import { Application } from './application';
import { log } from './debug-logger';

let app: Application;

export function activate(ctx: vscode.ExtensionContext) {
    app = Application.getInstance(ctx);

    // Status bar + menu
    app.architect.setStatusBar(ctx);
    app.architect.registerCommandShowMenu(ctx);

    // Configuration change listener
    app.architect.setOnChangeConfiguration(ctx);

    // Inline completion
    app.architect.setCompletionProvider(ctx);
    app.architect.registerCommandManualCompletion(ctx);
    app.architect.registerCommandNoCacheCompletion(ctx);
    app.architect.registerCommandAcceptFirstLine(ctx);
    app.architect.registerCommandAcceptFirstWord(ctx);
    app.architect.registerCommandSelectNextSuggestion(ctx);
    app.architect.registerCommandSelectPreviousSuggestion(ctx);

    // Ring-buffer & extra context
    app.architect.setOnChangeActiveFile(ctx);
    app.architect.setPeriodicRingBufferUpdate(ctx);

    // Health check
    app.architect.setPeriodicModelsHealthUpdate(ctx);

    // Init (version check, restore last model, llama.cpp install prompt)
    app.architect.init();

    log.info('extension', 'llama-vscode-fim activated');
}

export async function deactivate() {
    log.info('extension', 'llama-vscode-fim deactivating');
    app?.debugLogger.dispose();
}
