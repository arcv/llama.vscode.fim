import * as vscode from 'vscode';
import { Application } from './application';
import { LlamaResponse, InfillResponseItem } from './types';

export class Statusbar {
    private app: Application;
    statusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right, 1000,
    );

    constructor(app: Application) { this.app = app; }

    initializeStatusBar() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 1000,
        );
        this.statusBarItem.command = 'llama-vscode-fim.showMenu';
        this.statusBarItem.tooltip = 'Show llama-vscode-fim menu (Ctrl+Shift+M)';
        this.updateStatusBarText();
        this.statusBarItem.show();
    }

    registerEventListeners(ctx: vscode.ExtensionContext) {
        ctx.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(() => this.updateStatusBarText()),
            vscode.window.onDidChangeActiveTextEditor(() => this.updateStatusBarText()),
        );
    }

    updateStatusBarText() {
        const enabled = this.app.configuration.enabled;

        if (!enabled) {
            this.statusBarItem.text = '$(x) llama.vscode.fim';
        } else {
            this.statusBarItem.text = '$(check) llama.vscode.fim';
        }
    }

    showThinkingInfo() {
        this.statusBarItem.text = `llama-vscode-fim | 'thinking...'`;
        this.statusBarItem.show();
    }

    showInfo(data: LlamaResponse | InfillResponseItem | InfillResponseItem[] | undefined) {
        const t = Date.now() - this.app.extraContext.lastComplStartTime;
        const getContent = (): string => {
            if (!data) return '';
            if (Array.isArray(data)) return data[0]?.content ?? '';
            return data.content ?? '';
        };
        const content = getContent();
        if (!content.trim()) {
            this.statusBarItem.text = this.app.configuration.show_info
                ? `llama-vscode-fim | 'no suggestion' | r: ${this.app.extraContext.chunks.length}/${this.app.configuration.ring_n_chunks} | t: ${t} ms`
                : `llama-vscode-fim | t: ${t} ms`;
        } else {
            let tokens: number | undefined;
            let tps: string | undefined;
            const d = data!;
            if (Array.isArray(d)) {
                tokens = d[0]?.tokens_predicted;
            } else if ('timings' in d) {
                tokens = d.timings?.predicted_n;
                tps = d.timings?.predicted_per_second?.toFixed(1);
            } else {
                tokens = (d as InfillResponseItem).tokens_predicted;
            }
            this.statusBarItem.text = this.app.configuration.show_info
                ? `llama-vscode-fim | g: ${tokens} (${tps} t/s) | t: ${t} ms`
                : `llama-vscode-fim | t: ${t} ms`;
        }
        this.statusBarItem.show();
    }

    showCachedInfo() {
        const t = Date.now() - this.app.extraContext.lastComplStartTime;
        this.statusBarItem.text = this.app.configuration.show_info
            ? `llama-vscode | C: ${this.app.lruResultCache.size()}/${this.app.configuration.max_cache_keys} | t: ${t} ms`
            : `llama-vscode | t: ${t} ms`;
        this.statusBarItem.show();
    }

    showTextInfo(text: string | undefined) {
        this.statusBarItem.text = text ? `llama-vscode-fim | ${text}` : 'llama-vscode-fim';
    }
}
