import axios from 'axios';
import * as vscode from 'vscode';
import { Application } from './application';
import { InfillResponseItem } from './types';
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

        const endpoint = this.app.configuration.endpoint;
        if (!endpoint) {
            log.warn('LlamaServer', 'No endpoint configured — set llama-vscode-fim.endpoint in settings');
            return undefined;
        }

        const model = this.app.getComplModel().aiModel ?? this.app.configuration.ai_model;

        this.cancelPendingRequest();
        const controller = new AbortController();
        this.currentRequestController = controller;

        const fileName = vscode.window.activeTextEditor?.document.fileName || 'file.txt';
        const payload = this.buildV1Payload(
            inputPrefix, inputSuffix, prompt, model,
            Utils.getRelativePath(fileName),
        );

        try {
            const resp = await axios.post<OpenAICompletionResponse>(
                `${Utils.trimTrailingSlash(endpoint)}/v1/completions`,
                payload,
                { ...this.app.configuration.axiosRequestConfigCompl, signal: controller.signal },
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
            if (this.currentRequestController === controller) {
                this.currentRequestController = null;
            }
        }
        return undefined;
    }

    // ── Health check ──────────────────────────────────────────────────────

    /** Checks health against the single configured endpoint. */
    async checkHealth(endpoint: string): Promise<string> {
        if (!endpoint) return 'no endpoint configured';
        try {
            const resp = await axios.get(
                `${Utils.trimTrailingSlash(endpoint)}/health`,
                this.app.configuration.axiosRequestConfigCompl,
            );
            return resp.data?.status ?? 'unknown';
        } catch (err: any) {
            return `Error: ${err?.message ?? 'unknown'}`;
        }
    }

    // ── Private ───────────────────────────────────────────────────────────

    private buildV1Payload(
        prefix: string, suffix: string, prompt: string,
        model: string, fileName: string,
    ) {
        const fullPrompt =
            `<|file_sep|>${fileName}\n<|fim_prefix|>${prefix}${prompt}<|fim_suffix|>${suffix}<|fim_middle|>`;
        return {
            prompt: fullPrompt,
            max_tokens: this.app.configuration.n_predict,
            temperature: 0,
            top_p: 1.0,
            top_k: 1,
            stop: ['<|file_sep|>', '<|endoftext|>', '<|fim_prefix|>', '<|fim_suffix|>', '<|fim_middle|>'],
            model: model.trim() || undefined,
            messages: [{ role: 'user', content: fullPrompt }],
        };
    }
}