import { Terminal } from './Terminal';
import { Prompt } from './Prompt';
import { prompt } from 'prompts';
import Semaphore from '@hawryschuk/resource-locking/semaphore';
import AtomicData from '@hawryschuk/resource-locking/atomic.data';
const atomic = (resource: string, block: any) => Semaphore.getInstance({ data: AtomicData.getInstance({ resource }) }).use({ block });

export class ConsoleTerminal extends Terminal {
    async send(message: any) {
        console.log(message);
        await super.send(message);
    }
    async prompt(options: Prompt) {
        return await atomic(`ConsoleTerminal::prompt`, async () => {
            const result = super.prompt(options);
            const { response } = await (prompt({
                name: 'response',
                type: options.type,
                message: options.message,
                ...(options.choices ? { choices: options.choices } : {}),
                ...('initial' in options ? { initial: options.type === 'select' ? (options.choices as any[]).findIndex((i: any) => i.value === options?.initial) : options.initial } : {})
            }));
            console.log(this.id, '--responding with ', response)
            this.respond(response)
            return await result;
        });
    }
}
