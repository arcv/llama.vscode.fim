import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

const LEVEL_LABEL: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO ',
    [LogLevel.WARN]: 'WARN ',
    [LogLevel.ERROR]: 'ERROR',
};

export class DebugLogger {
    private static instance: DebugLogger;
    private outputChannel: vscode.OutputChannel;
    private logFile: string | undefined;
    private fileStream: fs.WriteStream | undefined;
    private minLevel: LogLevel = LogLevel.DEBUG;
    private enabled = true;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('llama-vscode-fim');
    }

    static getInstance(): DebugLogger {
        if (!DebugLogger.instance) {
            DebugLogger.instance = new DebugLogger();
        }
        return DebugLogger.instance;
    }

    /** Call once on activation with the extension context so we can write to the
     *  extension's storage path. Pass logLevel from config. */
    init(context: vscode.ExtensionContext, minLevel: LogLevel = LogLevel.DEBUG, toFile = true, enabled = true) {
        this.enabled = enabled;
        this.minLevel = minLevel;
        if (toFile && enabled) {
            const logDir = context.logUri.fsPath;
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
            this.logFile = path.join(logDir, 'llama-vscode-debug.log');
            this.fileStream = fs.createWriteStream(this.logFile, { flags: 'a' });
            this.info('DebugLogger', `Log file: ${this.logFile}`);
        }
    }

    setLevel(level: LogLevel) { this.minLevel = level; }
    setEnabled(enabled: boolean) { this.enabled = enabled; }
    isEnabled(): boolean { return this.enabled; }

    debug(tag: string, msg: string, data?: unknown) { this.write(LogLevel.DEBUG, tag, msg, data); }
    info(tag: string, msg: string, data?: unknown) { this.write(LogLevel.INFO, tag, msg, data); }
    warn(tag: string, msg: string, data?: unknown) { this.write(LogLevel.WARN, tag, msg, data); }
    error(tag: string, msg: string, data?: unknown) { this.write(LogLevel.ERROR, tag, msg, data); }

    /** Show the Output channel in the UI */
    show() { this.outputChannel.show(true); }

    /** Convenience: dump an object as pretty JSON */
    dump(tag: string, label: string, obj: unknown) {
        this.debug(tag, `${label}: ${JSON.stringify(obj, null, 2)}`);
    }

    private write(level: LogLevel, tag: string, msg: string, data?: unknown) {
        if (!this.enabled) return;
        if (level < this.minLevel) return;
        const ts = new Date().toISOString();
        const lbl = LEVEL_LABEL[level];
        const extra = data !== undefined
            ? (typeof data === 'string' ? ` | ${data}` : ` | ${JSON.stringify(data)}`)
            : '';
        const line = `${ts} [${lbl}] [${tag}] ${msg}${extra}`;

        // VS Code Output panel
        this.outputChannel.appendLine(line);

        // File
        if (this.fileStream) {
            this.fileStream.write(line + '\n');
        }

        // System console (visible in Extension Host Developer Tools)
        if (level >= LogLevel.WARN) {
            console.error(line);
        } else {
            console.log(line);
        }
    }

    dispose() {
        this.fileStream?.end();
        this.outputChannel.dispose();
    }
}

// Convenience singleton export so other modules can just `import { log } from './debug-logger'`
export const log = DebugLogger.getInstance();
