import { Prompt } from './Prompt';

export interface TerminalActivity<T = any> {
    stdout?: T;
    prompt?: Prompt<T>;
    time: number;
}
