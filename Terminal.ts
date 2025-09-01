import { Model } from '@hawryschuk-crypto/ORM';
import { Util } from '@hawryschuk-common/util';
import { Prompt } from './Prompt';
import { TerminalActivity } from './TerminalActivity';
export { TerminalActivity } from './TerminalActivity';

/** TODO: Document why this class is responsible for saving itself?? */

export class Terminal extends Model {
    public owner?: any;
    public history!: TerminalActivity[];
    public started!: number;
    public finished?: Date;
    public autoanswer?: { [promptName: string]: any[] };

    get available() { return !!this.owner && !this.finished; }

    async finish() {
        this.finished ||= new Date();
        for (const [name, prompts] of Object.entries(this.prompts)) {
            for (const prompt of prompts)
                prompt.resolved = undefined;
        }
        await this.notify(this.history.length - 1);
    }

    constructor({
        id = Util.UUID,
        history = [],
        autoanswer = {},
        started = Date.now(),
        ...data
    }: {
        id?: string;
        history?: TerminalActivity[];
        started?: number;
        autoanswer?: { [promptName: string]: any[] };
        owner?: any;
    } = {}) {
        super({ ...data, id, history, autoanswer, started });
    }

    subscribe(options: { handler: (index?: number) => any; event?: string; }) {
        this.subscribers.push(options);
        return { unsubscribe: () => Util.removeElements(this.subscribers, options) };
    }

    private get subscribers(): { handler: (index?: number) => any; event?: string; }[] { return (this as any)[Symbol.for('subscribers')] ||= []; }
    protected notify(index: number) { return Promise.all(this.subscribers.map(s => s.handler(index))); }

    /** Get the answers to the questions prompted 
     * -- Will erase old answers when re-prompted and unresolved
    */
    get input(): Record<string, any> {
        return this.history.reduce((input, item) => {
            if (item.prompt?.name)
                if ('resolved' in item.prompt)
                    input[item.prompt.name] = item.prompt.resolved;
                else
                    delete input[item.prompt.name];
            return input;
        }, {} as any)
    }

    /** Will give a history [array] of answers for each question prompted */
    get inputs(): Record<string, any[]> {
        return this.history.reduce((input, item) => {
            if (item.prompt?.name && 'resolved' in item.prompt)
                (input[item.prompt.name] ||= []).push(item.prompt.resolved);
            return input;
        }, {} as any)
    }

    get inputIndexes() {
        return this.history.reduce((input, item, index) => {
            if (item.prompt?.name && 'resolved' in item.prompt)
                input[item.prompt.name] = index;
            return input;
        }, {} as { [name: string]: number; })
    }

    get last(): TerminalActivity {
        return this.history.slice(-1)[0]
    }

    get allPrompts() {
        return this
            .history
            .reduce((all, { prompt }) => {
                if (prompt) (all[prompt.name] ||= []).push(prompt);
                return all;
            }, {} as Record<string, Prompt[]>);
    }

    get unansweredPrompts() {
        return this
            .history
            .filter(({ prompt }) => prompt && !('resolved' in prompt));

    }

    get prompts(): { [name: string]: Prompt[] } {
        return this
            .history
            .reduce((all, { prompt }) => {
                if (prompt && !('resolved' in prompt)) ((all[prompt.name] ||= []) as any[]).push(prompt);
                return all;
            }, {} as Record<string, Prompt[]>);
    }

    /** Will give the first unresolved prompt */
    get prompted() {
        return this
            .history
            .find(item => item.prompt && !('resolved' in item.prompt))
            ?.prompt;
    }

    /** STDOUT and STDIN (RESOLVED) */
    static DEFAULT_TO_STRING = ({}).toString();
    get buffer(): Array<{ type: 'stdin' | 'stdout'; data: string; }> {
        const tostring = (data: any) => {
            if (typeof data === 'string')
                return data;
            else {
                const str = data?.toString();
                return str === Terminal.DEFAULT_TO_STRING
                    ? JSON.stringify(data)
                    : str;
            }
        };
        const items = this.history
            .reduce((items, item) => {
                if (!item.prompt) {
                    items.push({ type: 'stdout', data: tostring(item.stdout) });
                } else if ('resolved' in item.prompt) {
                    const { message, name, resolved } = item.prompt;
                    items.push({ type: 'stdin', data: `${message || name} ${tostring(item.prompt.resolved)}` });
                }
                return items;
            }, [] as any);
        return items;
    }

    async send<T = any>(message: T) {
        /** TODO: Think about sending a Shallow Clone of message , in the case its a mutable object outside of this function call ( by the sender, or the receiver ) */
        if (this.finished) throw new Error('webterminal is finished');
        this.history.push({ stdout: Util.shallowClone(message), time: Date.now() });
        this.notify(this.history.length - 1);
    }

    /** Provide answers to multiple prompts which can carry into the future */
    async answer(answers: any) {
        answers = Util.deepClone(answers);
        await Util.waitUntil(async () => {
            if (this.finished) throw new Error('finished');
            for (const [key, val] of Object.entries(answers))
                if (this.prompts[key]) {
                    await this.respond(val instanceof Array ? val.shift() : val, key);
                    if (!(val instanceof Array) || val.length === 0) {
                        delete answers[key];
                    }
                }
            return Object.entries(answers).length === 0;
        }, { pause: 2 });
    }

    prompt<T = any>(prompt: Prompt<T>): Promise<T>;
    prompt<T = any>(prompt: Prompt<T>, waitResult: false): Promise<{ result: Promise<T>, clobbered: boolean; }>;
    async prompt<T = any>(prompt: Prompt<T>, waitResult = true) {
        if (this.finished) throw new Error('finished');
        const { prompts } = this;
        const time = Date.now();
        let { history: { length: index } } = this;
        let same = false;

        // clobber
        if ((prompt.clobber || 'resolved' in prompt) && prompts[prompt.name]) {
            const indexes = prompts[prompt.name].map(o => this.history.findIndex(i => i.prompt === o));
            index = indexes.pop()!;
            for (const index of indexes) this.history[index].prompt!.resolved = null;
            same = !!Util.equals(this.history[index].prompt, prompt);
            if (!same) {
                Object.assign(this.history[index], { prompt, time });
            }
        }

        // Add to the history
        else {
            this.history.push({ prompt, time });
        }

        // await this.save();
        if (!same) this.notify(index);

        const clobbered = index === this.history.length;

        const result: Promise<T> = Util
            .waitUntil(async () => 'resolved' in (this.history[index]?.prompt || {}) || this.finished, { pause: 50 })
            .then(() => this.history[index].prompt!.resolved);
        return waitResult ? await result : { result, clobbered };
    }

    async respond(value: any, name?: string, index?: number) {
        if (this.finished) throw new Error('webterminal is finished')
        index ??= this.history.findIndex(item => item.prompt && !('resolved' in item.prompt) && (!name || name == item.prompt.name));
        name ??= this.history[index]?.prompt?.name;
        const item: TerminalActivity = Util.deepClone(this.history[index]);
        if (!item.prompt) throw new Error(`unknown-item`);
        if ('resolved' in item.prompt!) throw new Error(`already-resolved`);
        if (item.prompt!.name !== name) throw new Error(`name-mismatch`);
        item.prompt.resolved = value;
        this.history[index] = item;
        // await this.save();
        this.notify(index);
    }

}



