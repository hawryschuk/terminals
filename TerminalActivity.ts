import { Prompt } from './Prompt';

export interface TerminalActivity {
    type: string | 'stdout' | 'prompt';
    options?: Prompt;
    message?: string;
    time: number;
}
