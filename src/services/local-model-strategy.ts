import * as vscode from 'vscode';
import { Application } from '../application';
import { IAddStrategy, LlmModel, ModelTypeDetails } from '../types';
import { Utils } from '../utils';

const LOCAL_COMMAND_TEMPLATES: Record<string, string> = {
    completion_models_list:
        'llama-server -hf ggml-org/Qwen2.5-Coder-1.5B-Q8_0-GGUF -ngl 99 -ub 1024 -b 1024 --ctx-size 0 --cache-reuse 256 --port PORT --host HOST',
    chat_models_list:
        'llama-server -hf ggml-org/Qwen2.5-Coder-7B-Instruct-Q8_0-GGUF -ngl 99 -ub 1024 -b 1024 --ctx-size 0 --cache-reuse 256 -np 2 --port PORT --host HOST',
};

export class LocalModelStrategy implements IAddStrategy {
    private app: Application;

    constructor(app: Application) {
        this.app = app;
    }

    async add(details: ModelTypeDetails): Promise<void> {
        const port = details.newModelPort;
        const host = details.newModelHost;
        const templateRaw = LOCAL_COMMAND_TEMPLATES[details.modelsListSettingName] ?? '';
        const template = templateRaw.replace(/PORT/g, String(port)).replace(/HOST/g, host);

        // Name
        let name = await Utils.getValidatedInput(
            'Name for your model (required)',
            (v) => v.trim() !== '',
            5,
            { placeHolder: 'User-friendly display name (required)', value: '' },
        );
        if (name === undefined) { vscode.window.showInformationMessage('Model addition cancelled.'); return; }
        name = name.trim();

        // Local start command
        let localStartCommand = await Utils.getValidatedInput(
            'Command to start the model locally (required)',
            (v) => v.trim() !== '',
            5,
            {
                placeHolder: `e.g. llama-server -m model.gguf --port ${port}`,
                value: template,
            },
        );
        if (localStartCommand === undefined) { vscode.window.showInformationMessage('Model addition cancelled.'); return; }
        localStartCommand = this.app.modelService.sanitizeCommand(localStartCommand);

        const newModel: LlmModel = { name, localStartCommand, aiModel: '' };

        const endpoint = this.app.configuration.endpoint;
        const confirmed = await Utils.confirmAction(
            'Add this model?',
            `name: ${name}\n` +
            `local start command: ${localStartCommand}\n` +
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
        return `name: ${m.name} | start: ${m.localStartCommand || '(none)'}`;
    }
}