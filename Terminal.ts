import { Model } from '@hawryschuk-crypto/ORM';
import { Util } from '@hawryschuk-common/util';
import { Prompt } from './Prompt';
import { TerminalActivity } from './TerminalActivity';
export { TerminalActivity } from './TerminalActivity';

/** TODO: Document why this class is responsible for saving itself?? */

export class Terminal extends Model {
    public id!: string;
    public owner?: any;
    public history!: TerminalActivity[];
    public started!: number;
    public finished?: Date;
    public autoanswer?: { [promptName: string]: any[] };

    get available() { return !this.owner && !this.finished }

    async finish() { this.finished ||= new Date(); }

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

    get subscribers(): { handler: Function; event?: string; }[] { return (this as any)[Symbol.for('subscribers')] ||= []; }
    subscribe(options: { handler: Function; event?: string; }) { this.subscribers.push(options); return this; }
    async notify(event: any = this.last) { await Promise.all(this.subscribers.map(s => s.handler(event))); }

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

    get promptedActivity(): TerminalActivity[] {
        return this
            .history
            .filter((item: any) => item.options && !('resolved' in item.options));
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
            .map(item => item.message || (item.options?.resolved !== undefined ? `${item.options?.message} ${item.options?.resolved}` : item.options?.message))
            .join('\n');
    }

    async send(message: any) {
        if (this.finished) throw new Error('webterminal is finished');
        this.history.push({ type: 'stdout', message, time: Date.now() });
        // await this.save();
        this.notify();
    }

    /** Provide answers to multiple prompts which can carry into the future */
    async answer(answers: any) {
        for (const [key, val] of Object.entries(answers)) {
            await Util.waitUntil(async () => {
                if (this.finished) throw new Error('finished');
                return this.prompts[key];
            }, { pause: 2 });
            await this.respond(val, key);
        }
    }

    async prompt(options: Prompt, waitResult = true): Promise<any> {
        if (this.finished) throw new Error('webterminal is finished')
        if (options.clobber && this.prompts[options.name]) {
            const indexes = this.prompts[options.name].map(o => this.history.findIndex(i => i.options === o));
            for (const index of indexes) await this.respond(null, undefined, index);
        }
        const { history: { length } } = this;
        this.history.push({ type: 'prompt', options, time: Date.now() });
        // await this.save();
        this.notify(this.history[length]);
        const result = Util
            .waitUntil(async () => this.finished || 'resolved' in (this.history[length]?.options || {}), { pause: 3 })
            .then(() => this.history[length].options!.resolved)
            // .then(result => options.choices ? options.choices![result].value : result);
        return waitResult ? await result : { result };
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
        this.notify(this.history[index]);
    }

}



