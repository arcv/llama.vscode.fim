import * as vscode from 'vscode';
import { Application } from '../application';
import { IAddStrategy, LlmModel, ModelTypeDetails } from '../types';
import { Utils } from '../utils';

export class ExternalModelStrategy implements IAddStrategy {
    private app: Application;

    constructor(app: Application) {
        this.app = app;
    }

    async add(details: ModelTypeDetails): Promise<void> {
        // Name
        let name = await Utils.getValidatedInput(
            'Name for your model (required)',
            (v) => v.trim() !== '',
            5,
            { placeHolder: 'User-friendly display name (required)', value: '' },
        );
        if (name === undefined) { vscode.window.showInformationMessage('Model addition cancelled.'); return; }
        name = name.trim();

        // Model name as the provider expects it
        const aiModel = (await vscode.window.showInputBox({
            placeHolder: 'Model name exactly as expected by the provider, e.g. qwen/qwen3-30b-a3b',
            prompt: 'Leave empty if llama-server is used without an explicit model name',
            value: '',
        }) ?? '').trim();

        const newModel: LlmModel = { name, aiModel };

        const endpoint = this.app.configuration.endpoint;
        const confirmed = await Utils.confirmAction(
            'Add this model?',
            `name: ${name}\n` +
            `model name for provider: ${aiModel || '(none)'}\n` +
            `endpoint (from settings): ${endpoint}`,
        );
        if (!confirmed) return;

        let shouldOverwrite = false;
        [newModel.name, shouldOverwrite] = await this.getUniqueModelName(details.modelsList, newModel);
        if (!newModel.name) {
            vscode.window.showInformationMessage('Model not added — no name provided.');
            return;
        }
        if (shouldOverwrite) {
            const idx = details.modelsList.findIndex((m) => m.name === newModel.name);
            if (idx !== -1) details.modelsList.splice(idx, 1);
        }
        details.modelsList.push(newModel);
        this.app.configuration.updateConfigValue(details.modelsListSettingName, details.modelsList);
        vscode.window.showInformationMessage('Model added.');
    }

    // ── Private ───────────────────────────────────────────────────────────

    private async getUniqueModelName(
        modelsList: LlmModel[], newModel: LlmModel,
    ): Promise<[string, boolean]> {
        let uniqueName = newModel.name;
        let shouldOverwrite = false;
        let existing = modelsList.find((m) => m.name === uniqueName);

        while (uniqueName && !shouldOverwrite && existing !== undefined) {
            shouldOverwrite = await Utils.confirmAction(
                'A model with that name already exists. Overwrite?',
                `Existing: ${this.summary(existing)}\nNew: ${this.summary(newModel)}`,
            );
            if (!shouldOverwrite) {
                uniqueName = ((await vscode.window.showInputBox({
                    placeHolder: 'Unique name for the new model',
                    prompt: 'Leave empty to cancel.',
                    value: newModel.name,
                })) ?? '').trim();
                if (uniqueName) existing = modelsList.find((m) => m.name === uniqueName);
            }
        }
        return [uniqueName, shouldOverwrite];
    }

    private summary(m: LlmModel): string {
        return `name: ${m.name} | provider model: ${m.aiModel || '(none)'}`;
    }
}