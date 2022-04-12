import { Prompt } from './Prompt';

export interface TerminalActivity {
    type: string;
    options?: Prompt;
    message?: string;
}
