import * as vscode from 'vscode';
import { Application } from './application';
import { UI_TEXT_KEYS } from './constants';
import { Utils } from './utils';
import { log } from './debug-logger';

export class Menu {
    private app: Application;

    constructor(app: Application) { this.app = app; }

    showMenu = async () => {
        const items = this.buildItems();
        const sel = await vscode.window.showQuickPick(items, { title: 'llama-vscode-fim' });
        if (!sel) return;

        await this.handle(sel.label);
        this.app.statusbar.updateStatusBarText();
    };

    // ── Public helpers used from other classes ────────────────────────────

    async setCompletion(enabled: boolean) {
        await this.app.configuration.updateConfigValue('enabled', enabled);
        log.info('Menu', `setCompletion: ${enabled}`);
    }

    // ── Private ───────────────────────────────────────────────────────────
    private buildItems(): vscode.QuickPickItem[] {
        const cfg = this.app.configuration;
        const t = (k: string) => k;
        const enabled = cfg.enabled;

        return [
            // ── Actions ─────────────────────────────────────────────────
            { label: t(UI_TEXT_KEYS.actions), kind: vscode.QuickPickItemKind.Separator },
            { label: 'Install/upgrade llama.cpp', description: 'Installs/upgrades llama.cpp server' },
            {
                label: `${enabled ? t(UI_TEXT_KEYS.disable) : t(UI_TEXT_KEYS.enable)} ${t(UI_TEXT_KEYS.allCompletions)}`,
                description: enabled
                    ? t(UI_TEXT_KEYS.turnOffCompletionsGlobally)
                    : t(UI_TEXT_KEYS.turnOnCompletionsGlobally),
            },

            // ── Model selection ──────────────────────────────────────────
            { label: t(UI_TEXT_KEYS.maintenance), kind: vscode.QuickPickItemKind.Separator },
            { label: t(UI_TEXT_KEYS.completionModels), description: 'Select / add / remove completion models' },

            // ── Debug ────────────────────────────────────────────────────
            { label: t(UI_TEXT_KEYS.showDebugLog), description: 'Show the llama-vscode-fim output channel' },

            // ── Settings / Help ──────────────────────────────────────────
            { label: '$(gear) ' + t(UI_TEXT_KEYS.editSettings) },
            { label: t(UI_TEXT_KEYS.help), kind: vscode.QuickPickItemKind.Separator },
            { label: t(UI_TEXT_KEYS.howToUseLlamaVscode) },
            { label: t(UI_TEXT_KEYS.howToDeleteModels), description: t(UI_TEXT_KEYS.howToDeleteModelsDescription) },
            { label: '$(book) ' + t(UI_TEXT_KEYS.viewDocumentation) },
        ];
    }

    private async handle(label: string) {
        const cfg = this.app.configuration;
        const t = (k: string) => k;

        log.debug('Menu', `selected: ${label}`);

        switch (label) {
            case `${cfg.enabled ? t(UI_TEXT_KEYS.disable) : t(UI_TEXT_KEYS.enable)} ${t(UI_TEXT_KEYS.allCompletions)}`:
                await cfg.updateConfigValue('enabled', !cfg.enabled);
                break;

            case t(UI_TEXT_KEYS.completionModels):
                await this.app.modelService.processModelActions();
                break;

            case t(UI_TEXT_KEYS.showDebugLog):
                this.app.debugLogger.show();
                break;

            case '$(gear) ' + t(UI_TEXT_KEYS.editSettings):
                await vscode.commands.executeCommand('workbench.action.openSettings', 'llama-vscode-fim');
                break;

            case t(UI_TEXT_KEYS.howToUseLlamaVscode):
                this.showHowTo();
                break;

            case '$(book) ' + t(UI_TEXT_KEYS.viewDocumentation):
                await vscode.env.openExternal(vscode.Uri.parse('https://github.com/arcv/llama.vscode.fim/wiki'));
                break;
        }
    }

    private showHowTo() {
        Utils.showOkDialog(
            'How to use llama-vscode-fim (FIM completion)\n\n' +
            '1. Install llama.cpp from this menu → "Install/upgrade llama.cpp"\n' +
            '2. Select a completion model from "Completion models..."\n' +
            '3. Start typing — completions appear automatically (Tab to accept, Esc to reject)\n\n' +
            'Keyboard shortcuts:\n' +
            '  Ctrl+L          – trigger completion manually\n' +
            '  Ctrl+Shift+L    – trigger (bypass cache)\n' +
            '  Shift+Tab       – accept first line only\n' +
            '  Ctrl+→          – accept first word\n' +
            '  Alt+] / Alt+[   – next / previous parallel completion\n',
        );
    }
}
