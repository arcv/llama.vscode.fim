export interface IAddStrategy {
    add(details: ModelTypeDetails): Promise<void>;
}

export interface LlmModel {
    name: string;
    aiModel?: string;
    isKeyRequired?: boolean;
    endpoint?: string;
    localStartCommand?: string;
}

export interface LlamaResponse {
    content?: string;
    generation_settings?: any;
    tokens_cached?: number;
    truncated?: boolean;
    timings?: {
        prompt_n?: number;
        prompt_ms?: number;
        prompt_per_second?: number;
        predicted_n?: number;
        predicted_ms?: number;
        predicted_per_second?: number;
    };
}

export interface InfillResponseItem {
    index: number;
    content: string;
    tokens: any[];
    stop: boolean;
    model: string;
    tokens_predicted: number;
    tokens_evaluated: number;
    generation_settings?: any;
}

export interface ChunkEntry {
    uri: string;
    content: string;
    firstLine: number;
    lastLine: number;
    hash: string;
    embedding: number[];
}

export interface ModelTypeDetails {
    modelsList: LlmModel[];
    modelsListSettingName: string;
    newModelPort: number;
    newModelHost: string;
    selModelPropName: string;
    launchSettingName: string;
}
