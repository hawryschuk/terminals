import { DAO, Model } from '@hawryschuk/dao';
import { Util } from '@hawryschuk/common';
import { Prompt } from './Prompt';
import { TerminalActivity } from './TerminalActivity';
import { TerminalRestApiClient } from './TerminalRestApiClient';
export { TerminalActivity } from './TerminalActivity';

export class Terminal extends Model {
    static uuid = Util.UUID;
    static instances: Terminal[] = [];
    public id!: string;
    public owner?: any;
    public history!: TerminalActivity[];
    public started = new Date;
    public finished?: Date;
    public autoanswer?: { [promptName: string]: any[] };

    get available() { return !this.owner && !this.finished }

    async finish() { await this.update$({ finished: this.finished || new Date() }); }

    constructor({
        id = `terminal-${Terminal.uuid}-${Terminal.instances.length + 1}`,
        owner,
        history = [],
        autoanswer = {},
        ...data
    } = {} as {
        id?: string;
        history?: TerminalActivity[];
        autoanswer?: { [promptName: string]: any[] };
        owner?: any;
    }, dao = DAO.instance) {
        super({ ...data, history, id, autoanswer }, dao);
        Terminal.instances.push(this);
        if (owner && !Util.equalsDeep(owner, {}))
            this.owner = owner;
    }

    get subscribers(): { handler: Function; event?: string; }[] { return (this as any)[Symbol.for('subscribers')] ||= []; }
    subscribe(options: { handler: Function; event?: string; }) { this.subscribers.push(options); return this; }
    async notify(event: any = this.last) { await Promise.all(this.subscribers.map(s => s.handler(event))); }

    get input() {
        return this.history.reduce((input, item) => {
            if (item.options?.name && 'resolved' in item.options)
                input[item.options.name] = item.options.resolved;
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

    get inputs() {
        return this.history.reduce((input, item) => {
            if (item.options?.name && 'resolved' in item.options)
                (input[item.options.name] ||= []).push(item.options.resolved);
            return input;
        }, {} as any)
    }

    get last(): TerminalActivity {
        return this.history.slice(-1)[0]
    }

    get promptedActivity(): TerminalActivity[] {
        return this
            .history
            .filter((item: any) => Util.safely(() => item.type === 'prompt' && !('resolved' in item.options)))
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
        if (this.finished) throw new Error('webterminal is finished')
        await this.update$!({ history: [...this.history, { type: 'stdout', message }] });
        this.notify();
    }

    /** User the following answers to the current and future prompts */
    answer(answers: any) {
        if (this.finished) throw new Error('webterminal is finished')
        return Promise.all(Object
            .entries(answers)
            .map(async ([key, val]) => {
                for (const _val of (val instanceof Array ? val : [val])) {
                    await Util.waitUntil(() => this.finished || this.prompts[key] && this.respond(_val, key), { pause: 2 });
                }
            }));
    }

    async prompt(options: Prompt): Promise<any> {
        if (this.finished) throw new Error('webterminal is finished')
        if (options.clobber && this.prompts[options.name]) {
            const indexes = this.prompts[options.name].map(o => this.history.findIndex(i => i.options === o));
            for (const index of indexes) await this.respond(null, undefined, index);
        }
        const { history: { length } } = this;
        await this.update$!({ history: [...this.history, { type: 'prompt', options }] });
        this.notify(this.history[length]);
        await Util.waitUntil(() => { return this.finished || 'resolved' in (this.history[length]?.options || {}); }, { pause: 3 });
        return this.history[length].options!.resolved;
    }

    async respond(value: any, name?: string, index?: number): Promise<{ name: string; index: number; value: any; }> {
        if (this.finished) throw new Error('webterminal is finished')
        if (index === undefined) index = this.history.findIndex(item => item?.type === 'prompt' && item.options && !('resolved' in item.options!) && (!name || name == item.options!.name));
        if (name === undefined) name = this.history[index]?.options?.name;
        const item = Util.deepClone(this.history[index]);
        if (!item) throw new Error(`unknown-item`);
        if (item.type !== 'prompt') throw new Error(`type-mismatch`);
        if ('resolved' in item.options) throw new Error(`already-resolved`);
        if (item.options.name !== name) throw new Error(`name-mismatch`);
        item.options.resolved = value;
        await this.update$!({ history: Object.assign([...this.history], { [index]: item }) });
        this.notify(this.history[index]);
        return { name: name!, index, value };
    }

}



