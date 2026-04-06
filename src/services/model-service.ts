import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Application } from '../application';
import { IAddStrategy, LlmModel, ModelTypeDetails } from '../types';
import { ModelType, MODEL_TYPE_CONFIG, UI_TEXT_KEYS } from '../constants';
import { Utils } from '../utils';
import { log } from '../debug-logger';

export class ModelService {
    private app: Application;
    private strategies: Record<string, IAddStrategy>;

    constructor(app: Application) {
        this.app = app;
        this.strategies = {
            local: app.localModelStrategy,
            external: app.externalModelStrategy,
        };
    }

    // ── Menu actions ──────────────────────────────────────────────────────

    getActions(): vscode.QuickPickItem[] {
        return [
            { label: UI_TEXT_KEYS.selectStartCompletionModel },
            { label: UI_TEXT_KEYS.deselectStopCompletionModel },
            { label: UI_TEXT_KEYS.addLocalCompletionModel },
            { label: UI_TEXT_KEYS.addExternalCompletionModel },
            { label: UI_TEXT_KEYS.viewCompletionModelDetails },
            { label: UI_TEXT_KEYS.deleteCompletionModel },
            { label: UI_TEXT_KEYS.exportCompletionModel },
            { label: UI_TEXT_KEYS.importCompletionModel },
        ];
    }

    async processModelActions() {
        const sel = await vscode.window.showQuickPick(this.getActions());
        if (!sel) return;
        await this.processAction(sel.label);
    }

    async processAction(label: string) {
        const d = this.getTypeDetails();
        switch (label) {
            case UI_TEXT_KEYS.selectStartCompletionModel:
                await this.selectModel(d.modelsList); break;
            case UI_TEXT_KEYS.deselectStopCompletionModel:
                await this.deselectAndClearModel(); break;
            case UI_TEXT_KEYS.addLocalCompletionModel:
                await this.addModel('local'); break;
            case UI_TEXT_KEYS.addExternalCompletionModel:
                await this.addModel('external'); break;
            case UI_TEXT_KEYS.viewCompletionModelDetails:
                await this.viewModel(d.modelsList); break;
            case UI_TEXT_KEYS.deleteCompletionModel:
                await this.deleteModel(d.modelsList, d.modelsListSettingName); break;
            case UI_TEXT_KEYS.exportCompletionModel:
                await this.exportModel(d.modelsList); break;
            case UI_TEXT_KEYS.importCompletionModel:
                await this.importModel(d.modelsList, d.modelsListSettingName); break;
        }
    }

    // ── Select ────────────────────────────────────────────────────────────

    async selectModel(modelsList: LlmModel[]): Promise<LlmModel | undefined> {
        const endpoint = this.app.configuration.endpoint;
        const items: vscode.QuickPickItem[] = modelsList.map((m, i) => ({
            label: `${i + 1}. ${m.name}`,
            description: m.localStartCommand || '',
            detail: m.localStartCommand
                ? `Selects, downloads if needed, and starts a llama-server. Requests → ${endpoint}`
                : `Selects this model. Requests → ${endpoint}`,
        }));
        items.push({ label: `${items.length + 1}. Use settings (endpoint + launch_completion)` });

        const sel = await vscode.window.showQuickPick(items);
        if (!sel) return undefined;

        const idx = parseInt(sel.label.split('. ')[0], 10) - 1;
        const model: LlmModel = idx === modelsList.length
            ? { name: 'Use settings', localStartCommand: this.app.configuration.launch_completion, aiModel: '' }
            : modelsList[idx];

        await this.selectStartModel(model);
        return model;
    }

    async selectStartModel(model: LlmModel) {
        log.info('ModelService', `selectStartModel: ${model.name}`);
        this.app.setSelectedModel(ModelType.Completion, model);
        await this.app.persistence.setValue('selectedComplModel', model);
    }

    async deselectAndClearModel() {
        log.info('ModelService', 'deselectAndClearModel');
        this.app.setSelectedModel(ModelType.Completion, Application.emptyModel);
        this.app.setModelState(ModelType.Completion, '');
    }

    // ── Add ───────────────────────────────────────────────────────────────

    async addModel(kind: 'local' | 'external') {
        await this.strategies[kind].add(this.getTypeDetails());
    }

    // ── Delete ────────────────────────────────────────────────────────────

    async deleteModel(list: LlmModel[], settingName: string) {
        const sel = await vscode.window.showQuickPick(list.map((m, i) => ({ label: `${i + 1}. ${m.name}` })));
        if (!sel) return;
        const idx = parseInt(sel.label.split('. ')[0], 10) - 1;
        const ok = await Utils.confirmAction('Delete this model?', this.getDetails(list[idx]));
        if (ok) {
            list.splice(idx, 1);
            this.app.configuration.updateConfigValue(settingName, list);
            vscode.window.showInformationMessage('Model deleted.');
            log.info('ModelService', `deleted model idx=${idx}`);
        }
    }

    // ── View ──────────────────────────────────────────────────────────────

    async viewModel(list: LlmModel[]) {
        const sel = await vscode.window.showQuickPick(list.map((m, i) => ({ label: `${i + 1}. ${m.name}` })));
        if (!sel) return;
        const idx = parseInt(sel.label.split('. ')[0], 10) - 1;
        await Utils.showOkDialog('Model details:\n\n' + this.getDetails(list[idx]));
    }

    // ── Export ────────────────────────────────────────────────────────────

    async exportModel(list: LlmModel[]) {
        const sel = await vscode.window.showQuickPick(list.map((m, i) => ({ label: `${i + 1}. ${m.name}` })));
        if (!sel) return;
        const idx = parseInt(sel.label.split('. ')[0], 10) - 1;
        const model = list[idx];
        const ok = await Utils.showYesNoDialog(`Export model?\n\n${this.getDetails(model)}`);
        if (!ok) return;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(vscode.workspace.rootPath ?? '', `${model.name}.json`)),
            filters: { 'Model Files': ['json'] },
        });
        if (!uri) return;
        fs.writeFileSync(uri.fsPath, JSON.stringify(model, null, 2), 'utf8');
        vscode.window.showInformationMessage('Model exported.');
        log.info('ModelService', `exported model to ${uri.fsPath}`);
    }

    // ── Import ────────────────────────────────────────────────────────────

    async importModel(list: LlmModel[], settingName: string) {
        const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Model Files': ['json'] } });
        if (!uris?.length) return;
        const raw = JSON.parse(fs.readFileSync(uris[0].fsPath, 'utf8')) as LlmModel;
        raw.name = this.sanitizeInput(raw.name ?? '');
        raw.localStartCommand = this.sanitizeCommand(raw.localStartCommand ?? '');
        raw.aiModel = this.sanitizeInput(raw.aiModel ?? '');
        const ok = await Utils.confirmAction('Add imported model?', this.getDetails(raw));
        if (ok) {
            list.push(raw);
            this.app.configuration.updateConfigValue(settingName, list);
            vscode.window.showInformationMessage(`Model imported: ${raw.name}`);
            log.info('ModelService', `imported model: ${raw.name}`);
        }
    }

    // ── Health check ──────────────────────────────────────────────────────

    async checkModelHealth() {
        const endpoint = this.app.configuration.endpoint;
        const state = await this.app.llamaServer.checkHealth(endpoint);
        if (state.toLowerCase() === 'ok' || state.toLowerCase() === 'healthy') {
            vscode.window.showInformationMessage('Completion model health: OK');
        } else {
            vscode.window.showErrorMessage(`Completion model health: ${state}`);
        }
        this.app.setModelState(ModelType.Completion, state);
        log.info('ModelService', `health check result: ${state}`);
    }

    periodicModelHealthUpdate = async () => {
        if (!this.app.configuration.health_check_compl_enabled || !this.app.isComplModelSelected()) return;
        const endpoint = this.app.configuration.endpoint;
        const state = await this.app.llamaServer.checkHealth(endpoint);
        const prev = this.app.getModelState(ModelType.Completion);
        if ((prev === '' || prev === 'ok' || prev === 'healthy') && state !== 'ok' && state !== 'healthy') {
            vscode.window.showErrorMessage(`Completion model health error: ${state}`);
            log.warn('ModelService', `health degraded: ${state}`);
        }
        this.app.setModelState(ModelType.Completion, state.slice(0, 150));
    };

    // ── Utilities ─────────────────────────────────────────────────────────

    getTypeDetails(): ModelTypeDetails {
        const cfg = MODEL_TYPE_CONFIG[ModelType.Completion];
        return {
            modelsList: this.app.configuration.completion_models_list,
            modelsListSettingName: cfg.settingName,
            newModelPort: this.app.configuration.new_completion_model_port,
            newModelHost: this.app.configuration.new_completion_model_host,
            selModelPropName: cfg.propName,
            launchSettingName: cfg.launchSetting,
        };
    }

    getDetails(m: LlmModel): string {
        return `name: ${m.name}\n` +
            `local start command: ${m.localStartCommand ?? ''}\n` +
            `model name for provider: ${m.aiModel ?? ''}\n` +
            `endpoint: ${this.app.configuration.endpoint}`;
    }

    sanitizeCommand(cmd: string): string { return cmd?.trim() ?? ''; }
    sanitizeInput(s: string): string { return s?.trim() ?? ''; }
}