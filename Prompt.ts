
export interface Prompt {
    type: string; // text number multiple toggle
    name: string;
    message: string;
    min?: number;
    max?: number;
    initial?: any;
    choices?: { title: string; value: any; disabled?: boolean; description?: string; }[];
    resolve?: any;
    resolved?: any;
}
