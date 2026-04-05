import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Application } from '../application';
import { IAddStrategy, LlmModel, ModelTypeDetails } from '../types';
import { ModelType, MODEL_TYPE_CONFIG, UI_TEXT_KEYS, SETTING_NAME_FOR_LIST } from '../constants';
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

    // ── Action list for the menu ──────────────────────────────────────────
    getActions(): vscode.QuickPickItem[] {
        return [
            { label: this.t(UI_TEXT_KEYS.selectStartCompletionModel) },
            { label: this.t(UI_TEXT_KEYS.deselectStopCompletionModel) },
            { label: this.t(UI_TEXT_KEYS.addLocalCompletionModel) },
            { label: this.t(UI_TEXT_KEYS.addExternalCompletionModel) },
            { label: this.t(UI_TEXT_KEYS.viewCompletionModelDetails) },
            { label: this.t(UI_TEXT_KEYS.deleteCompletionModel) },
            { label: this.t(UI_TEXT_KEYS.exportCompletionModel) },
            { label: this.t(UI_TEXT_KEYS.importCompletionModel) },
        ];
    }

    async processModelActions() {
        const actions = this.getActions();
        const sel = await vscode.window.showQuickPick(actions);
        if (!sel) return;
        await this.processAction(sel.label);
    }

    async processAction(label: string) {
        const d = this.getTypeDetails();
        switch (label) {
            case this.t(UI_TEXT_KEYS.selectStartCompletionModel):
                await this.selectModel(d.modelsList); break;
            case this.t(UI_TEXT_KEYS.deselectStopCompletionModel):
                await this.deselectAndClearModel(); break;
            case this.t(UI_TEXT_KEYS.addLocalCompletionModel):
                await this.addModel('local'); break;
            case this.t(UI_TEXT_KEYS.addExternalCompletionModel):
                await this.addModel('external'); break;
            case this.t(UI_TEXT_KEYS.viewCompletionModelDetails):
                await this.viewModel(d.modelsList); break;
            case this.t(UI_TEXT_KEYS.deleteCompletionModel):
                await this.deleteModel(d.modelsList, d.modelsListSettingName); break;
            case this.t(UI_TEXT_KEYS.exportCompletionModel):
                await this.exportModel(d.modelsList); break;
            case this.t(UI_TEXT_KEYS.importCompletionModel):
                await this.importModel(d.modelsList, d.modelsListSettingName); break;
        }
    }

    // ── Select & start ────────────────────────────────────────────────────
    async selectModel(modelsList: LlmModel[]): Promise<LlmModel | undefined> {
        const items: vscode.QuickPickItem[] = modelsList.map((m, i) => ({
            label: `${i + 1}. ${m.name}`,
            description: m.localStartCommand,
            detail: m.localStartCommand
                ? 'Selects, downloads if needed, and starts a llama-server with this model.'
                : 'Selects this external model.',
        }));
        items.push({ label: `${items.length + 1}. Use settings (endpoint + launch_completion)` });

        const sel = await vscode.window.showQuickPick(items);
        if (!sel) return undefined;

        const idx = parseInt(sel.label.split('. ')[0], 10) - 1;
        let model: LlmModel;
        if (idx === modelsList.length) {
            model = {
                name: 'Use settings',
                endpoint: this.app.configuration.endpoint,
                localStartCommand: this.app.configuration.launch_completion,
                aiModel: "",
            };
        } else {
            model = modelsList[idx];
        }

        await this.selectStartModel(model);
        return model;
    }

    async selectStartModel(model: LlmModel) {
        log.info('ModelService', `selectStartModel: ${model.name}`);
        this.app.setSelectedModel(ModelType.Completion, model);
        const d = this.getTypeDetails();
        await this.app.persistence.setValue('selectedComplModel', model);
    }

    async deselectAndClearModel() {
        log.info('ModelService', 'deselectAndClearModel');
        const d = this.getTypeDetails();
        this.app.setSelectedModel(ModelType.Completion, Application.emptyModel);
        this.app.setModelState(ModelType.Completion, '');
    }

    // ── Add ───────────────────────────────────────────────────────────────
    async addModel(kind: 'local' | 'external') {
        const d = this.getTypeDetails();
        await this.strategies[kind].add(d);
    }

    // ── Delete ────────────────────────────────────────────────────────────
    async deleteModel(list: LlmModel[], settingName: string) {
        const items = list.map((m, i) => ({ label: `${i + 1}. ${m.name}` }));
        const sel = await vscode.window.showQuickPick(items);
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
        const items = list.map((m, i) => ({ label: `${i + 1}. ${m.name}` }));
        const sel = await vscode.window.showQuickPick(items);
        if (!sel) return;
        const idx = parseInt(sel.label.split('. ')[0], 10) - 1;
        await this.showModelDetails(list[idx]);
    }

    async showModelDetails(model: LlmModel) {
        await Utils.showOkDialog('Model details:\n\n' + this.getDetails(model));
    }

    // ── Export ────────────────────────────────────────────────────────────
    async exportModel(list: LlmModel[]) {
        const items = list.map((m, i) => ({ label: `${i + 1}. ${m.name}` }));
        const sel = await vscode.window.showQuickPick(items);
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
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'Model Files': ['json'] },
        });
        if (!uris?.length) return;
        const raw = JSON.parse(fs.readFileSync(uris[0].fsPath, 'utf8')) as LlmModel;
        raw.name = this.sanitizeInput(raw.name ?? '');
        raw.localStartCommand = this.sanitizeCommand(raw.localStartCommand ?? '');
        raw.endpoint = this.sanitizeInput(raw.endpoint ?? '');
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
        const model = this.app.getComplModel();
        const state = await this.app.llamaServer.checkHealth(model);
        if (state.toLowerCase() === 'ok' || state.toLowerCase() === 'healthy') {
            vscode.window.showInformationMessage('Completion model health: OK');
        } else {
            vscode.window.showErrorMessage(`Completion model health: ${state}`);
        }
        this.app.setModelState(ModelType.Completion, state);
        log.info('ModelService', `health check result: ${state}`);
    }

    periodicModelHealthUpdate = async () => {
        if (
            this.app.configuration.health_check_compl_enabled &&
            this.app.isComplModelSelected()
        ) {
            const state = await this.app.llamaServer.checkHealth(this.app.getComplModel());
            const prev = this.app.getModelState(ModelType.Completion);
            if ((prev === '' || prev === 'ok' || prev === 'healthy') &&
                state !== 'ok' && state !== 'healthy') {
                vscode.window.showErrorMessage(`Completion model health error: ${state}`);
                log.warn('ModelService', `health degraded: ${state}`);
            }
            this.app.setModelState(ModelType.Completion, state.slice(0, 150));
        }
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
            launchSettingName: cfg.launchSetting
        };
    }

    getDetails(m: LlmModel): string {
        return `name: ${m.name}\nlocal start command: ${m.localStartCommand ?? ''}\nendpoint: ${m.endpoint ?? ''}\nmodel name for provider: ${m.aiModel ?? ''}\napi key required: ${m.isKeyRequired ?? false}`;
    }

    sanitizeCommand(cmd: string): string { return cmd ? cmd.trim() : ''; }
    sanitizeInput(s: string): string { return s ? s.trim() : ''; }

    private t(key: string): string {
        return key;
    }
}
