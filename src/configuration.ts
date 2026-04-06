import * as vscode from 'vscode';
import https from 'https';
import fs from 'fs';
import { Utils } from './utils';
import { LogLevel } from './debug-logger';
import { log } from './debug-logger';

export class Configuration {
    // ── completion endpoint / launch ──────────────────────────────────────
    endpoint = 'http://127.0.0.1:8012';
    launch_completion = '';
    lora_completion = '';
    ai_model = ''

    // ── model ports / hosts ───────────────────────────────────────────────
    new_completion_model_port = 8012;
    new_completion_model_host = '127.0.0.1';

    // ── completion behaviour ──────────────────────────────────────────────
    auto = true;
    debounce_ms = 3000;
    n_prefix = 256;
    n_suffix = 64;
    n_predict = 128;
    t_max_prompt_ms = 500;
    t_max_predict_ms = 2500;
    max_line_suffix = 8;
    max_cache_keys = 250;
    max_parallel_completions = 3;
    single_line_completion = true;

    // ── ring-buffer context ───────────────────────────────────────────────
    ring_n_chunks = 16;
    ring_chunk_size = 64;
    ring_scope = 1024;
    ring_update_ms = 1000;

    // ── UI / misc ─────────────────────────────────────────────────────────
    enabled = true;
    show_info = true;

    // ── debug logging ─────────────────────────────────────────────────────
    /** Enable or disable all log output */
    debug_log_enabled = true;
    /** Minimum log level written to Output + file. 0=DEBUG 1=INFO 2=WARN 3=ERROR */
    debug_log_level: LogLevel = LogLevel.DEBUG;
    /** Write log entries to a file in the extension log directory */
    debug_log_to_file = true;

    // ── model lists ───────────────────────────────────────────────────────
    completion_models_list: any[] = [];

    // ── upgrade prompts ───────────────────────────────────────────────────
    ask_install_llamacpp = true;
    ask_upgrade_llamacpp_hours = 24;

    // ── health check ──────────────────────────────────────────────────────
    health_check_interval_s = 30;
    health_check_compl_enabled = false;

    // ── axios request configs ─────────────────────────────────────────────
    axiosRequestConfigCompl: Record<string, any> = {};

    // ── internal constants ────────────────────────────────────────────────
    readonly RING_UPDATE_MIN_TIME_LAST_COMPL = 3000;
    readonly MAX_LAST_PICK_LINE_DISTANCE = 32;
    readonly MAX_QUEUED_CHUNKS = 16;
    readonly DELAY_BEFORE_COMPL_REQUEST = 1000;
    readonly MAX_EVENTS_IN_LOG = 250;

    config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('llama-vscode-fim');
        this.updateConfigs(this.config);
    }

    private updateConfigs(config: vscode.WorkspaceConfiguration) {
        this.endpoint = Utils.trimTrailingSlash(String(config.get<string>('endpoint') ?? ''));
        this.launch_completion = String(config.get<string>('launch_completion') ?? '');
        this.lora_completion = String(config.get<string>('lora_completion') ?? '');
        this.new_completion_model_port = Number(config.get<number>('new_completion_model_port') ?? 8012);
        this.new_completion_model_host = String(config.get<string>('new_completion_model_host') ?? '127.0.0.1');
        this.auto = Boolean(config.get<boolean>('auto') ?? true);
        this.debounce_ms = Number(config.get<number>('debounce_ms') ?? 0);
        this.n_prefix = Number(config.get<number>('n_prefix') ?? 256);
        this.n_suffix = Number(config.get<number>('n_suffix') ?? 64);
        this.n_predict = Number(config.get<number>('n_predict') ?? 128);
        this.t_max_prompt_ms = Number(config.get<number>('t_max_prompt_ms') ?? 500);
        this.t_max_predict_ms = Number(config.get<number>('t_max_predict_ms') ?? 2500);
        this.max_line_suffix = Number(config.get<number>('max_line_suffix') ?? 8);
        this.max_cache_keys = Number(config.get<number>('max_cache_keys') ?? 250);
        this.max_parallel_completions = Number(config.get<number>('max_parallel_completions') ?? 3);
        this.ring_n_chunks = Number(config.get<number>('ring_n_chunks') ?? 16);
        this.ring_chunk_size = Number(config.get<number>('ring_chunk_size') ?? 64);
        this.ring_scope = Number(config.get<number>('ring_scope') ?? 1024);
        this.ring_update_ms = Number(config.get<number>('ring_update_ms') ?? 1000);
        this.enabled = Boolean(config.get<boolean>('enabled') ?? true);
        this.single_line_completion = Boolean(config.get<boolean>('single_line_completion') ?? true);
        this.show_info = Boolean(config.get<boolean>('show_info') ?? true);
        this.completion_models_list = config.get<any[]>('completion_models_list') ?? [];
        this.ask_install_llamacpp = Boolean(config.get<boolean>('ask_install_llamacpp') ?? true);
        this.ask_upgrade_llamacpp_hours = Number(config.get<number>('ask_upgrade_llamacpp_hours') ?? 24);
        this.health_check_interval_s = Number(config.get<number>('health_check_interval_s') ?? 30);
        this.health_check_compl_enabled = Boolean(config.get<boolean>('health_check_compl_enabled') ?? false);
        // debug
        this.debug_log_enabled = Boolean(config.get<boolean>('debug_log_enabled') ?? true);
        this.debug_log_level = Number(config.get<number>('debug_log_level') ?? LogLevel.DEBUG) as LogLevel;
        this.debug_log_to_file = Boolean(config.get<boolean>('debug_log_to_file') ?? true);
    }

    updateOnEvent(event: vscode.ConfigurationChangeEvent, config: vscode.WorkspaceConfiguration) {
        this.updateConfigs(config);
    }

    isCompletionEnabled(): boolean {
        return this.enabled;
    }

    async updateConfigValue(key: string, value: unknown) {
        await this.config.update(key, value, true);
    }
}
