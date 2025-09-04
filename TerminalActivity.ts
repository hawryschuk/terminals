import { Prompt } from './Prompt';

export const TO_STRING = Symbol.for('toString');

export interface TerminalActivity<T = any> {
    stdout?: T;
    prompt?: Prompt<T>;
    time: number;

    [TO_STRING]?: string;
}
