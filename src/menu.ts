import * as vscode from 'vscode';
import { Application } from './application';
import { log } from './debug-logger';

const ITEMS = {
    TOGGLE_AUTO: 'auto_trigger',
    EDIT_SETTINGS: 'edit_settings',
    HOW_TO: 'how_to',
    DEBUG_LOG: 'debug_log',
} as const;

type ItemKey = typeof ITEMS[keyof typeof ITEMS];

interface MenuItem {
    key: ItemKey;
    label: () => string;
    description: () => string;
}

export class Menu {
    private app: Application;

    constructor(app: Application) { this.app = app; }

    showMenu = async () => {
        const menuItems = this.buildItems();
        const picks = menuItems.map(i => ({
            label: i.label(),
            description: i.description(),
            key: i.key,
        }));

        const sel = await vscode.window.showQuickPick(picks, { title: 'llama-vscode-fim' });
        if (!sel) return;

        await this.handle(sel.key);
        this.app.statusbar.updateStatusBarText();
    };

    // ── Private ───────────────────────────────────────────────────────────

    private buildItems(): MenuItem[] {
        return [
            {
                key: ITEMS.TOGGLE_AUTO,
                label: () => this.app.configuration.auto
                    ? '$(circle-slash) Disable auto-trigger'
                    : '$(play) Enable auto-trigger',
                description: () => this.app.configuration.auto
                    ? 'Completions triggered automatically while typing'
                    : 'Completions only on Ctrl+L',
            },
            {
                key: ITEMS.EDIT_SETTINGS,
                label: () => '$(gear) Edit settings',
                description: () => 'Open llama-vscode-fim settings',
            },
            {
                key: ITEMS.HOW_TO,
                label: () => '$(question) How to use',
                description: () => 'Show keybindings and quick-start guide',
            },
            {
                key: ITEMS.DEBUG_LOG,
                label: () => '$(output) Show debug log',
                description: () => 'Open the llama-vscode-fim output channel',
            },
        ];
    }

    private async handle(key: ItemKey) {
        log.debug('Menu', `selected: ${key}`);

        switch (key) {
            case ITEMS.TOGGLE_AUTO:
                await this.app.configuration.updateConfigValue('auto', !this.app.configuration.auto);
                log.info('Menu', `auto-trigger → ${this.app.configuration.auto}`);
                break;

            case ITEMS.EDIT_SETTINGS:
                await vscode.commands.executeCommand('workbench.action.openSettings', 'llama-vscode-fim');
                break;

            case ITEMS.HOW_TO:
                this.showHowTo();
                break;

            case ITEMS.DEBUG_LOG:
                this.app.debugLogger.show();
                break;
        }
    }

    private showHowTo() {
        vscode.window.showInformationMessage(
            'llama-vscode-fim — quick start\n\n' +
            'Ctrl+L          trigger completion\n' +
            'Ctrl+Shift+L    trigger (bypass cache)\n' +
            'Tab             accept suggestion\n' +
            'Shift+Tab       accept first line\n' +
            'Ctrl+→          accept first word\n' +
            'Alt+] / Alt+[   next / previous completion\n' +
            'Ctrl+Shift+M    open this menu',
            { modal: true },
            'OK',
        );
    }
}