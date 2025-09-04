export const PromptResolved = Symbol.for('promise');
export const PromptIndex = Symbol.for('index');

export type PromptType =
    | "text"
    | "number"
    | "confirm"
    | "select"
    | 'any'

    | "password"
    | "invisible"
    | "list"
    | "toggle"
    | "multiselect"
    | "autocomplete"
    | "date"
    | "autocompleteMultiselect";

export interface Prompt<T = any> {
    type: PromptType; // text number multiple toggle
    name: string;
    message?: string;
    min?: number;
    max?: number;
    initial?: any;
    choices?: { title: string; value: any; disabled?: boolean; description?: string; selected?: boolean; }[];
    resolved?: T;
    clobber?: boolean;
    timeout?: number;

    updated?: number;
    timeResolved?: number;
    [PromptResolved]?: Promise<T>;
    [PromptIndex]?: number;
}
