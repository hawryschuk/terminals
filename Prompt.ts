export type PromptType =
    | "text"
    | "password"
    | "invisible"
    | "number"
    | "confirm"
    | "list"
    | "toggle"
    | "select"
    | "multiselect"
    | "autocomplete"
    | "date"
    | "autocompleteMultiselect";

export interface Prompt<T=any> {
    type: PromptType; // text number multiple toggle
    name: string;
    message?: string;
    min?: number;
    max?: number;
    initial?: any;
    choices?: { title: string; value: any; disabled?: boolean; description?: string; }[];
    resolved?: T;
    clobber?: boolean;
    timeout?: number;
}
