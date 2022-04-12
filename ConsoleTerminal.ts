import { Terminal } from './Terminal';
import { Prompt } from './Prompt';
import { prompt } from 'prompts';
export class ConsoleTerminal extends Terminal {
    async send(message: any) { console.log(message) }
    async prompt(options: Prompt) {
        const { response } = await prompt({
            name: 'response',
            type: options.type,
            message: options.message,
            ...(options.choices ? { choices: options.choices } : {}),
            ...('initial' in options ? { initial: options.type === 'select' ? (options.choices as any[]).findIndex((i: any) => i.value === options?.initial) : options.initial } : {})
        });
        return response;
    }
}
