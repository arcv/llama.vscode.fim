export enum ModelType {
    Completion = 'completion',
}

export const MODEL_TYPE_CONFIG = {
    [ModelType.Completion]: {
        settingName: 'completion_models_list',
        portSetting: 'new_completion_model_port',
        hostSetting: 'new_completion_model_host',
        launchSetting: 'launch_completion',
        propName: 'selectedComplModel' as const,
    },
} as const;

export const HF_MODEL_TEMPLATES = {
    [ModelType.Completion]:
        'llama-server -hf MODEL_PLACEHOLDER -ngl 99 -ub 1024 -b 1024 -dt 0.1 --ctx-size 0 --cache-reuse 256 --port PORT_PLACEHOLDER --host HOST_PLACEHOLDER',
} as const;

export const LOCAL_MODEL_TEMPLATES = {
    [ModelType.Completion]:
        'llama-server -hf <model name from hugging face, i.e: ggml-org/Qwen2.5-Coder-1.5B-Q8_0-GGUF> -ngl 99 -ub 1024 -b 1024 --ctx-size 0 --cache-reuse 256 --port PORT_PLACEHOLDER --host HOST_PLACEHOLDER',
} as const;

export const SETTING_TO_MODEL_TYPE: Record<string, ModelType> = {
    completion_models_list: ModelType.Completion,
};

export const SETTING_NAME_FOR_LIST = {
    COMPLETION_MODELS: MODEL_TYPE_CONFIG[ModelType.Completion].settingName,
} as const;

export const PERSISTENCE_KEYS = {
    EXTENSION_VERSION: 'extensionVersion' as const,
    SELECTED_COMPL_MODEL: 'selectedComplModel' as const,
} as const;

export const UI_TEXT_KEYS = {
    // Completions
    selectStartCompletionModel: 'FIM Models',
    deselectStopCompletionModel: 'Deselect/stop completion model',
    addLocalCompletionModel: 'New FIM model',
    addExternalCompletionModel: 'Configure External FIM model',
    viewCompletionModelDetails: 'View Details',
    deleteCompletionModel: 'Delete FIM model',
    exportCompletionModel: 'Export FIM model',
    importCompletionModel: 'Import FIM model',
    // Menu sections
    actions: 'Actions',
    maintenance: 'Maintenance',
    help: 'Help',
    // Toggles
    disable: 'Disable',
    enable: 'Enable',
    allCompletions: 'FIM',
    turnOffCompletionsGlobally: 'Disable FIM',
    turnOnCompletionsGlobally: 'Enable FIM',
    completionsFor: 'Completions for',
    currently: 'Currently',
    enabled: 'enabled',
    disabled: 'disabled',
    enableAutoComplete: 'Enable Auto Completion',
    disableAutoComplete: 'Disable Auto Completion',
    autoCompleteOn: 'Auto completion on (triggers automatically while typing)',
    autoCompleteOff: 'Auto completion off (manual trigger only: Ctrl+L)',
    // Misc
    completionModels: 'FIM Models',
    editSettings: 'Settings',
    viewDocumentation: 'View Docs',
    showDebugLog: 'Show Logs',
    howToUseLlamaVscode: 'How to use llama-vscode-fim',
    howToDeleteModels: 'How to delete models',
    howToDeleteModelsDescription: 'Explains how to delete the downloaded models',
} as const;
