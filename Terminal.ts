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
            if (item.options?.name)
                if ('resolved' in item.options)
                    input[item.options.name] = item.options.resolved;
                else
                    delete input[item.options.name];
            return input;
        }, {} as any)
    }

    /** Will give a history [array] of answers for each question prompted */
    get inputs(): Record<string, any[]> {
        return this.history.reduce((input, item) => {
            if (item.options?.name && 'resolved' in item.options)
                (input[item.options.name] ||= []).push(item.options.resolved);
            return input;
        }, {} as any)
    }

    get inputIndexes() {
        return this.history.reduce((input, item, index) => {
            if (item.options?.name && 'resolved' in item.options)
                input[item.options.name] = index;
            return input;
        }, {} as { [name: string]: number; })
    }

    get last(): TerminalActivity {
        return this.history.slice(-1)[0]
    }


    get prompts2() {
        return this
            .history
            .filter((item: any) => item.type === 'prompt' && item.options)
            .reduce((all, item) => {
                (all[item.options!.name] ||= []).push(item.options!);
                return all;
            }, {} as { [name: string]: Prompt[] });
    }

    get promptedActivity(): TerminalActivity[] {
        return this
            .history
            .filter((item: any) => item.type === 'prompt' && item.options && !('resolved' in item.options));
    }

    get prompts(): { [name: string]: Prompt[] } {
        return this
            .promptedActivity
            .reduce((all, item) => {
                if (item.options) ((all[item.options.name] ||= []) as any[]).push(item.options)
                return all;
            }, {} as { [name: string]: Prompt[] });
    }

    promptedFor({ name, value } = {} as { name: string; value: any }) {
        return this
            .promptedActivity
            .filter(i => i.options?.name === name)
            .find(i => ('initial' in i.options! && i.options!.initial === value)
                || (i.options?.choices || []).some(c => c.value === value && !c.disabled)
            )
    }

    /** Will give the first unresolved prompt */
    get prompted(): Prompt | null {
        return this
            .history
            .find((item: any) => Util.safely(() => item.type === 'prompt' && !('resolved' in item.options)))
            ?.options
            || null
    }

    get buffer(): string {
        return this.history
            .filter(item => item.type !== 'prompt' || item.options?.resolved !== undefined)
            .map(item => item.message || (item.options?.resolved !== undefined ? `${item.options?.message || item.options.name} ${item.options?.resolved}` : item.options?.message))
            .map(item => typeof item === 'string' ? item : JSON.stringify(item))
            .join('\n');
    }

    async send<T = any>(message: T) {
        if (this.finished) throw new Error('webterminal is finished');
        this.history.push({ type: 'stdout', message, time: Date.now() });
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

    prompt<T = any>(options: Prompt<T>): Promise<T>;
    prompt<T = any>(options: Prompt<T>, waitResult: false): Promise<{ result: Promise<T>, clobbered: boolean; }>;
    async prompt<T = any>(options: Prompt<T>, waitResult = true) {
        if (this.finished) throw new Error('finished');

        // Overwrite the first one , and remove  : TODO : think , auto-clobber
        let { history: { length: index } } = this;
        let same = false;
        if ((options.clobber || 'resolved' in options) && this.prompts[options.name]) {
            const indexes = this.prompts[options.name].map(o => this.history.findIndex(i => i.options === o));
            index = indexes.pop()!;
            for (const index of indexes) this.history[index].options!.resolved = null;
            same = !!Util.equals(this.history[index].options, options);
            if (!same) Object.assign(this.history[index], { options, time: Date.now() });
        }
        // Add to the history
        else {
            this.history.push({ type: 'prompt', options, time: Date.now() });
        }

        // await this.save();
        if (!same) this.notify(index);

        const clobbered = index === this.history.length;

        const result: Promise<T> = Util
            .waitUntil(
                async () => {
                    if (this.finished) return undefined;
                    return 'resolved' in (this.history[index]?.options || {});
                },
                { pause: 50 }
            )
            .then(() => this.history[index].options!.resolved);
        return waitResult ? await result : { result, clobbered };
    }

    async respond(value: any, name?: string, index?: number) {
        if (this.finished) throw new Error('webterminal is finished')
        index ??= this.history.findIndex(item => item?.type === 'prompt' && item.options && !('resolved' in item.options!) && (!name || name == item.options!.name));
        name ??= this.history[index]?.options?.name;
        const item = Util.deepClone(this.history[index]);
        if (!item) throw new Error(`unknown-item`);
        if (item.type !== 'prompt') throw new Error(`type-mismatch`);
        if ('resolved' in item.options) throw new Error(`already-resolved`);
        if (item.options.name !== name) throw new Error(`name-mismatch`);
        item.options.resolved = value;
        this.history[index] = item;
        // await this.save();
        this.notify(index);
    }

}



