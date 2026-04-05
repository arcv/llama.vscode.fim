import axios from 'axios';
import * as vscode from 'vscode';
import { Application } from './application';
import { LlmModel, InfillResponseItem } from './types';
import { Utils } from './utils';
import { log } from './debug-logger';

const STATUS_OK = 200;

interface OpenAICompletionResponse {
    choices: {
        index: number;
        text: string;
        finish_reason: string | null;
    }[];
    model: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
    };
}

export class LlamaServer {
    private app: Application;
    private currentRequestController: AbortController | null = null;

    constructor(app: Application) {
        this.app = app;
    }

    /** Cancel any in-flight completion request */
    cancelPendingRequest(): void {
        if (this.currentRequestController) {
            this.currentRequestController.abort();
            log.debug('LlamaServer', 'Aborted previous request');
            this.currentRequestController = null;
        }
    }

    // ── FIM completion ────────────────────────────────────────────────────
    async getFIMCompletion(
        inputPrefix: string,
        inputSuffix: string,
        prompt: string,
    ): Promise<InfillResponseItem[] | undefined> {

        const { endpoint, model, requestConfig } = this.getComplModelProperties();
        // log.info("LlamaServer", JSON.stringify([endpoint, model, requestConfig]))
        if (!endpoint) return undefined;

        // 1. Manage Cancellation
        this.cancelPendingRequest();

        // Create a local reference to the new controller
        const controller = new AbortController();
        this.currentRequestController = controller;

        // 2. Prepare Payload with Language Context
        const fileName = vscode.window.activeTextEditor?.document.fileName || 'file.txt';
        const shortName = Utils.getRelativePath(fileName);
        const payload = this.buildV1Payload(inputPrefix, inputSuffix, prompt, model, shortName);


        try {
            const resp = await axios.post<OpenAICompletionResponse>(
                `${Utils.trimTrailingSlash(endpoint)}/v1/completions`,
                payload,
                {
                    ...requestConfig,
                    signal: controller.signal, // Use the local reference
                },
            );

            if (resp.status === STATUS_OK && resp.data.choices?.length > 0) {
                return resp.data.choices.map((choice, idx) => ({
                    index: choice.index ?? idx,
                    content: choice.text ?? '',
                    tokens: [],
                    stop: choice.finish_reason !== null,
                    model: resp.data.model ?? model,
                    tokens_predicted: resp.data.usage?.completion_tokens ?? 1,
                    tokens_evaluated: resp.data.usage?.prompt_tokens ?? 0,
                }));
            }
        } catch (err: any) {
            if (!axios.isCancel(err)) {
                log.error('LlamaServer', 'FIM request failed', err?.message);
            }
        } finally {
            // ONLY clear the class property if it hasn't been overwritten by a newer request
            if (this.currentRequestController === controller) {
                this.currentRequestController = null;
            }
        }
        return undefined;
    }

    private buildV1Payload(prefix: string, suffix: string, prompt: string, model: string, fileName: string) {
        // Native Qwen FIM format with file context
        const fullPrompt = `<|file_sep|>${fileName}\n<|fim_prefix|>${prefix}${prompt}<|fim_suffix|>${suffix}<|fim_middle|>`;

        return {
            prompt: fullPrompt,
            max_tokens: this.app.configuration.n_predict,
            temperature: 0,
            top_p: 1.0,
            top_k: 1,
            stop: ['<|file_sep|>', '<|endoftext|>', '<|fim_prefix|>', '<|fim_suffix|>', '<|fim_middle|>'],
            model: model.trim() || undefined,
        };
    }

    private getComplModelProperties() {
        const sel = this.app.getComplModel();

        // Use selected model values if available, otherwise fall back to configuration
        const endpoint = sel.endpoint || this.app.configuration.endpoint;
        const model = sel.aiModel || this.app.configuration.ai_model;
        const requestConfig = this.app.configuration.axiosRequestConfigCompl;

        return { endpoint, model, requestConfig };
    }

    // ── Health check ──────────────────────────────────────────────────────
    async checkHealth(model: LlmModel): Promise<string> {
        if (!model.endpoint) return 'no endpoint';
        try {
            const resp = await axios.get(`${model.endpoint}/health`, this.app.configuration.axiosRequestConfigCompl);
            return resp.data?.status ?? 'unknown';
        } catch (err: any) {
            return `Error: ${err?.message ?? 'unknown'}`;
        }
    }
}