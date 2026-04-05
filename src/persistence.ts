import * as vscode from 'vscode';

export class Persistence {
    private readonly prefix = 'llama.vscode.fim';
    private ctx: vscode.ExtensionContext;

    constructor(ctx: vscode.ExtensionContext) {
        this.ctx = ctx;
    }

    // ── Workspace-scoped generic KV ───────────────────────────────────────
    async setValue(key: string, value: unknown) {
        await this.ctx.workspaceState.update(this.prefix + key, value);
    }
    getValue<T>(key: string): T | undefined {
        return this.ctx.workspaceState.get<T>(this.prefix + key);
    }
    deleteValue(key: string) {
        this.ctx.workspaceState.update(this.prefix + key, undefined);
    }

    // ── Global KV ─────────────────────────────────────────────────────────
    async setGlobalValue(key: string, value: unknown) {
        await this.ctx.globalState.update(this.prefix + key, value);
    }
    getGlobalValue<T>(key: string): T | undefined {
        return this.ctx.globalState.get<T>(this.prefix + key);
    }
    deleteGlobalValue(key: string) {
        this.ctx.globalState.update(this.prefix + key, undefined);
    }
}
