import { Terminal } from './Terminal';
import { Prompt } from './Prompt';
import { prompt } from 'prompts';
import { Mutex } from '@hawryschuk-locking/Mutex';
import { createInterface } from 'readline';

export class ConsoleTerminal extends Terminal {
    override async send(message: any) {
        console.log(message);
        await super.send(message);
    }

    override async prompt(options: Prompt, waitResult = true) {
        return await Mutex.getInstance(`ConsoleTerminal::prompt`).use({
            block: async () => {
                const { result } = await super.prompt(options, false);
                const result2 = (async () => {
                    const response = ['text', 'number', 'confirm'].includes(options.type)
                        ? await ConsoleTerminal.readlinePrompt(options)  // improved version that handles escapes and timeouts : TODO: multiselect,etc...
                        : (await prompt({
                            name: 'response',
                            type: options.type,
                            message: options.message,
                            ...(options.choices ? { choices: options.choices } : {}),
                            ...('initial' in options ? {
                                initial: options.type === 'select'
                                    ? Math.max(0, (options.choices as any[]).findIndex((i: any) => i.value === options?.initial))
                                    : options.initial
                            } : {})
                        })
                            .catch((e: any) => {
                                options.resolved = undefined;
                                throw e;
                            }));
                    await this.respond(response);
                    return await result;
                })();
                return waitResult ? await result2 : { result: result2 };
            }
        });
    }

    static async readlinePrompt(options: Prompt) {
        let resolve: (v?: string) => string | undefined;
        let autoresolve = (a?: any) => {
            if (a !== undefined) process.stdout.write(a.toString());
            process.stdout.write("\n");
            resolve(a);
        };
        const timeout = options.timeout ? setTimeout(() => autoresolve(options.initial), options.timeout) : undefined;
        const readline = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        const escape = (ch: any, key: any) => { if (key?.name == 'escape') autoresolve(undefined); };
        const keypress = require('keypress'); keypress(process.stdin); process.stdin.on('keypress', escape);
        const answer: any = await new Promise((r: any, reject) => {
            resolve = r;

            if (/text|number/.test(options.type)) {
                readline.question(`${options.message}${options.initial === undefined ? '' : `[${options.initial}]`}? `, a => resolve(
                    a.length == 0 && options.initial !== undefined ? options.initial
                        : options.type == 'text' ? a
                            : !Number.isNaN(Number(a)) ? Number(a)
                                : undefined
                ));
            }

            else if (options.type == 'confirm')
                readline.question(`${options.message} [${options.initial == undefined && 'y/n' || options.initial == true && 'Y/n' || 'y/N'}]? `, a => resolve(
                    a.length == 0 ? options.initial
                        : /^y/i.test(a) ? true
                            : /^n/i.test(a) ? false
                                : undefined
                ));

            else
                reject('unsupported-type')
        });

        if (timeout) clearTimeout(timeout);
        readline.close();
        process.stdin.off('keypress', escape);

        return answer;
    }
}
