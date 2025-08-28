import { Prompt } from './Prompt';

export interface TerminalActivity<T = any> {
    type: string | 'stdout' | 'prompt';
    options?: Prompt;
    message?: T;
    time: number;
}
