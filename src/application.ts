import * as vscode from 'vscode';
import { Configuration } from './configuration';
import { ExtraContext } from './extra-context';
import { LlamaServer } from './llama-server';
import { LRUCache } from './lru-cache';
import { Architect } from './architect';
import { Statusbar } from './statusbar';
import { Menu } from './menu';
import { Completion } from './completion';
import { Persistence } from './persistence';
import { ModelService } from './services/model-service';
import { LocalModelStrategy } from './services/local-model-strategy';
import { ExternalModelStrategy } from './services/external-model-strategy';
import { LlmModel } from './types';
import { ModelType, PERSISTENCE_KEYS } from './constants';
import { DebugLogger, log } from './debug-logger';

/** Thin event-log kept in memory for the "Copy Chunks" debug command.
 *  Also forwards every entry to DebugLogger so it appears in the Output panel. */
class Logger {
    private app: Application;
    eventlogs: string[] = [];

    constructor(app: Application) { this.app = app; }

    addEventLog(group: string, event: string, details: string) {
        const entry = `${Date.now()}, ${group}, ${event}, ${details.replace(',', ' ')}`;
        this.eventlogs.push(entry);
        if (this.eventlogs.length > this.app.configuration.MAX_EVENTS_IN_LOG) {
            this.eventlogs.shift();
        }
        // Forward to structured debug logger
        log.debug('EventLog', `[${group}] ${event}`, details || undefined);
    }
}

export class Application {
    static readonly emptyModel: LlmModel = { name: '' };
    private static instance: Application;

    readonly configuration: Configuration;
    readonly extraContext: ExtraContext;
    readonly llamaServer: LlamaServer;
    readonly lruResultCache: LRUCache;
    readonly architect: Architect;
    readonly statusbar: Statusbar;
    readonly menu: Menu;
    readonly completion: Completion;
    readonly logger: Logger;
    readonly persistence: Persistence;
    readonly modelService: ModelService;
    readonly localModelStrategy: LocalModelStrategy;
    readonly externalModelStrategy: ExternalModelStrategy;
    readonly debugLogger: DebugLogger;

    private selectedComplModel: LlmModel = Application.emptyModel;
    private modelState = new Map<string, string>();

    private constructor(ctx: vscode.ExtensionContext) {
        this.configuration        = new Configuration();
        this.llamaServer          = new LlamaServer(this);
        this.extraContext         = new ExtraContext(this);
        this.lruResultCache       = new LRUCache(this.configuration.max_cache_keys);
        this.statusbar            = new Statusbar(this);
        this.menu                 = new Menu(this);
        this.completion           = new Completion(this);
        this.logger               = new Logger(this);
        this.persistence          = new Persistence(ctx);
        this.debugLogger          = DebugLogger.getInstance();

        // Strategies must exist before ModelService
        this.localModelStrategy      = new LocalModelStrategy(this);
        this.externalModelStrategy   = new ExternalModelStrategy(this);
        this.modelService            = new ModelService(this);

        // Architect wires everything together
        this.architect = new Architect(this);

        // Init debug logger
        this.debugLogger.init(ctx, this.configuration.debug_log_level, this.configuration.debug_log_to_file, this.configuration.debug_log_enabled);
        log.info('Application', 'Application instance created');
    }

    static getInstance(ctx: vscode.ExtensionContext): Application {
        if (!Application.instance) {
            Application.instance = new Application(ctx);
        }
        return Application.instance;
    }

    // ── Completion model accessors ────────────────────────────────────────
    getComplModel(): LlmModel { return this.selectedComplModel; }

    isComplModelSelected(): boolean {
        return this.selectedComplModel.name.trim() !== '';
    }

    setSelectedModel(type: ModelType, model: LlmModel | undefined) {
        if (type === ModelType.Completion) {
            this.selectedComplModel = model ?? Application.emptyModel;
            log.info('Application', `Completion model set: ${this.selectedComplModel.name}`);
        }
        this.statusbar.updateStatusBarText();
    }

    setModelState(type: ModelType, state: string) {
        this.modelState.set(type, state);
        this.statusbar.updateStatusBarText();
    }

    getModelState(type: ModelType): string {
        return this.modelState.get(type) ?? '';
    }
}
