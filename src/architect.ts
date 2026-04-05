import * as vscode from 'vscode';
import { Application } from './application';
import { ModelType, PERSISTENCE_KEYS } from './constants';
import { Utils } from './utils';
import { log } from './debug-logger';

export class Architect {
    private app: Application;

    constructor(app: Application) { this.app = app; }

    // ── Called once on extension activation ───────────────────────────────
    init = async () => {
        log.info('Architect', 'init start');

        // Version banner
        const currentVersion = vscode.extensions.getExtension('arcv.llama-vscode-fim')
            ?.packageJSON?.version as string | undefined;
        const storedVersion = this.app.persistence.getGlobalValue<string>(PERSISTENCE_KEYS.EXTENSION_VERSION);
        if (currentVersion && storedVersion && currentVersion !== storedVersion) {
            vscode.window.showInformationMessage('llama-vscode-fim extension is updated.');
            log.info('Architect', `updated ${storedVersion} → ${currentVersion}`);
        }
        if (currentVersion) {
            await this.app.persistence.setGlobalValue(PERSISTENCE_KEYS.EXTENSION_VERSION, currentVersion);
        }

        // Restore last selected completion model
        const lastModel = this.app.persistence.getValue<any>('selectedComplModel');
        if (lastModel?.name) {
            log.info('Architect', `restoring last completion model: ${lastModel.name}`);
            this.app.setSelectedModel(ModelType.Completion, lastModel);
        }

        log.info('Architect', 'init done');
    };

    // ── Status bar ────────────────────────────────────────────────────────
    setStatusBar(ctx: vscode.ExtensionContext) {
        this.app.statusbar.initializeStatusBar();
        this.app.statusbar.registerEventListeners(ctx);
        ctx.subscriptions.push(
            vscode.commands.registerCommand('llama-vscode-fim.showMenu', async () => {
                await this.app.menu.showMenu();
            }),
        );
    }

    // ── Configuration change listener ─────────────────────────────────────
    setOnChangeConfiguration(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                const cfg = vscode.workspace.getConfiguration('llama-vscode-fim');
                this.app.configuration.updateOnEvent(event, cfg);
            }),
        );
    }

    // ── Inline completion provider ────────────────────────────────────────
    setCompletionProvider(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.languages.registerInlineCompletionItemProvider(
                { pattern: '**' },
                {
                    provideInlineCompletionItems: async (doc, pos, context, token) => {
                        if (!this.app.configuration.isCompletionEnabled()) return undefined;
                        return this.app.completion.getCompletionItems(doc, pos, context, token);
                    },
                },
            ),
        );
    }

    // ── Keyboard commands ─────────────────────────────────────────────────
    registerCommandManualCompletion(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('extension.triggerInlineCompletion', async () => {
                if (!vscode.window.activeTextEditor) {
                    vscode.window.showErrorMessage('No active editor!');
                    return;
                }
                vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
            }),
        );
    }

    registerCommandNoCacheCompletion(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('extension.triggerNoCacheCompletion', async () => {
                if (!vscode.window.activeTextEditor) {
                    vscode.window.showErrorMessage('No active editor!');
                    return;
                }
                await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');
                await Utils.delay(50);
                this.app.completion.isForcedNewRequest = true;
                vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
            }),
        );
    }

    registerCommandAcceptFirstLine(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('extension.acceptFirstLine', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor) await this.app.completion.insertFirstLine(editor);
            }),
        );
    }

    registerCommandAcceptFirstWord(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('extension.acceptFirstWord', async () => {
                const editor = vscode.window.activeTextEditor;
                if (editor) await this.app.completion.insertNextWord(editor);
            }),
        );
    }

    registerCommandSelectNextSuggestion(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('extension.selectNextSuggestion', async () => {
                if (!vscode.window.activeTextEditor) return;
                await vscode.commands.executeCommand('editor.action.inlineSuggest.showNext');
                await this.app.completion.increaseSuggestionIndex();
            }),
        );
    }

    registerCommandSelectPreviousSuggestion(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('extension.selectPreviousSuggestion', async () => {
                if (!vscode.window.activeTextEditor) return;
                await vscode.commands.executeCommand('editor.action.inlineSuggest.showPrevious');
                await this.app.completion.decreaseSuggestionIndex();
            }),
        );
    }

    // ── Ring-buffer periodic update ───────────────────────────────────────
    setPeriodicRingBufferUpdate(ctx: vscode.ExtensionContext) {
        const id = setInterval(
            this.app.extraContext.periodicRingBufferUpdate,
            this.app.configuration.ring_update_ms,
        );
        ctx.subscriptions.push({ dispose: () => clearInterval(id) });
    }

    // ── Periodic health check ─────────────────────────────────────────────
    setPeriodicModelsHealthUpdate(ctx: vscode.ExtensionContext) {
        const id = setInterval(
            this.app.modelService.periodicModelHealthUpdate,
            this.app.configuration.health_check_interval_s * 1000,
        );
        ctx.subscriptions.push({ dispose: () => clearInterval(id) });
    }

    // ── Active-editor change ──────────────────────────────────────────────
    setOnChangeActiveFile(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (!editor?.document || !this.app.configuration.isCompletionEnabled()) return;
                setTimeout(() => {
                    this.app.extraContext.pickChunkAroundCursor(
                        editor.selection.active.line, editor.document,
                    );
                }, 0);
            }),
        );
    }

    // ── Show menu command (extra alias used by status bar) ────────────────
    registerCommandShowMenu(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.commands.registerCommand('extension.showMenu', async () => {
                await this.app.menu.showMenu();
            }),
        );
    }
}
