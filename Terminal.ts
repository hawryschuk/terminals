import { Model } from '@hawryschuk-crypto/ORM';
import { Util } from '@hawryschuk-common/util';
import { Prompt, PromptIndex, PromptResolved } from './Prompt';
import { TerminalActivity, TO_STRING } from './TerminalActivity';
export { TerminalActivity } from './TerminalActivity';


export const Symbols = {
    SUBSCRIBERS: Symbol.for('subscribers'),
    PROMPTS: Symbol.for('prompts'),
    INDEX: Symbol.for('index'),
    INPUT: Symbol.for('input'),
    TO_STRING
};

export class Terminal<T = any> extends Model {
    public owner?: any;
    public history!: TerminalActivity<T>[];
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
        super({ ...data, id, history: [], autoanswer, started });
        history.forEach(item => this.put(item));
    }

    get prompted() { return this.unansweredPrompts[0]?.prompt }
    get unansweredPrompts(): TerminalActivity<T>[] { return (this as any)[Symbol.for('unansweredPrompts')] ||= [] }
    get inputs(): Record<string, any[]> { return (this as any)[Symbol.for('inputs')] ||= {} }
    get updated(): number { return (this as any)[Symbol.for('updated')] }
    set updated(t: number) { (this as any)[Symbol.for('updated')] = t; }
    get inputIndexes(): Record<string, number> { return (this as any)[Symbol.for('INPUT_INDEX')] ||= {}; }
    get input(): Record<string, any> { return (this as any)[Symbols.INPUT] ||= {}; }

    put(item: TerminalActivity, index = this.history.length) {
        const exists = !!this.history[index];
        this.updated = Date.now();

        /** Add : Track Prompt Index & Resolved */
        if (!exists) {
            this.history[index] = item;
            if (item.prompt) {
                this.unansweredPrompts.push(item);
                item.prompt[PromptIndex] = index;
                item.prompt[PromptResolved] ||= (() => {
                    // const rando = Util.UUID;
                    // if (item.prompt.name === 'age') { console.log({ rando }); debugger; }
                    return Util
                        .waitUntil(() => 'resolved' in item.prompt! || this.finished)
                        .then(() => {
                            if ('resolved' in item.prompt!) {
                                this.updated = Date.now();
                                item.prompt!.timeResolved ||= Date.now();
                                Util.removeElements(this.unansweredPrompts, item);
                                (this.inputs[item.prompt!.name] ||= []).push(item.prompt!.resolved!);
                                if (index === this.inputIndexes[item.prompt!.name])
                                    this.input[item.prompt!.name] = item.prompt!.resolved!;
                                const prompts = this.prompts[item.prompt!.name];
                                if (prompts) {
                                    Util.removeElements(prompts, item.prompt);
                                    if (prompts.length === 0) { delete this.prompts[item.prompt!.name]; }
                                    delete item[TO_STRING]; // let it lazy-reload
                                }
                                this.notify(index);
                            }
                            return item.prompt!.resolved!;
                        });
                })();
            }
        } else {
            item.prompt &&= Object.assign(this.history[index].prompt!, { ...item.prompt, updated: Date.now() });
            item = Object.assign(this.history[index], item);
        }

        /** Track input and prompts */
        if (item.prompt) {
            /** Update input */
            const inputIndex = this.inputIndexes[item.prompt!.name] ??= index;
            if (inputIndex <= index) {
                this.inputIndexes[item.prompt!.name] = index;
                if (!('resolved' in item.prompt))
                    delete this.input[item.prompt.name];
            }

            /** Update prompts */
            if (!('resolved' in item.prompt) && !exists) {
                const prompts: Terminal['prompts'][string] = (this.prompts[item.prompt.name] ||= []);
                prompts.push(item.prompt);
            }
        }

        this.notify(index);
    }

    toString(item: TerminalActivity) {
        return item[TO_STRING] ??= item.prompt
            ? 'resolved' in item.prompt
                ? `${item.prompt.message || item.prompt.name} ${Util.toString(item.prompt.resolved)}`
                : ''
            : Util.toString(item.stdout)
    }

    get prompts(): Record<string, Prompt[]> { return (this as any)[Symbols.PROMPTS] ||= {}; }

    subscribe(options: { handler: (index?: number) => any; event?: string; }) {
        this.subscribers.push(options);
        return { unsubscribe: () => Util.removeElements(this.subscribers, options) };
    }

    private get subscribers(): { handler: (index?: number) => any; event?: string; }[] { return (this as any)[Symbols.SUBSCRIBERS] ||= []; }
    protected notify(index: number) { return Promise.all(this.subscribers.map(s => s.handler(index))); }

    /** Get the answers to the questions prompted 
     * -- Will erase old answers when re-prompted and unresolved
    */
    // get input(): Record<string, any> {
    //     return this.history.reduce((input, item) => {
    //         if (item.prompt?.name)
    //             if ('resolved' in item.prompt)
    //                 input[item.prompt.name] = item.prompt.resolved;
    //             else
    //                 delete input[item.prompt.name];
    //         return input;
    //     }, {} as any)
    // }

    /** Will give a history [array] of answers for each question prompted */
    // get inputs(): Record<string, any[]> {
    //     return this.history.reduce((input, item) => {
    //         if (item.prompt?.name && 'resolved' in item.prompt)
    //             (input[item.prompt.name] ||= []).push(item.prompt.resolved);
    //         return input;
    //     }, {} as any)
    // }

    // get inputIndexes() {
    //     return this.history.reduce((input, item, index) => {
    //         if (item.prompt?.name && 'resolved' in item.prompt)
    //             input[item.prompt.name] = index;
    //         return input;
    //     }, {} as { [name: string]: number; })
    // }

    get last() { return this.history.slice(-1)[0] }

    // get allPrompts() {
    //     return this
    //         .history
    //         .reduce((all, { prompt }) => {
    //             if (prompt) (all[prompt.name] ||= []).push(prompt);
    //             return all;
    //         }, {} as Record<string, Prompt[]>);
    // }

    // get unansweredPrompts() {
    //     return this
    //         .history
    //         .filter(({ prompt }) => prompt && !('resolved' in prompt));

    // }

    // get prompts(): { [name: string]: Prompt[] } {
    //     return this
    //         .history
    //         .reduce((all, { prompt }) => {
    //             if (prompt && !('resolved' in prompt)) ((all[prompt.name] ||= []) as any[]).push(prompt);
    //             return all;
    //         }, {} as Record<string, Prompt[]>);
    // }

    /** STDOUT and STDIN (RESOLVED) */
    // get buffer(): Array<{ type: 'stdin' | 'stdout'; data: string; }> {
    //     const items = this.history
    //         .reduce((items, item) => {
    //             if (!item.prompt) {
    //                 items.push({ type: 'stdout', data: Util.toString(item.stdout) });
    //             } else if ('resolved' in item.prompt) {
    //                 const { message, name, resolved } = item.prompt;
    //                 items.push({ type: 'stdin', data: `${message || name} ${Util.toString(resolved)}` });
    //             }
    //             return items;
    //         }, [] as any);
    //     return items;
    // }

    async send<T = any>(message: T) {
        /** TODO: Think about sending a Shallow Clone of message , in the case its a mutable object outside of this function call ( by the sender, or the receiver ) */
        if (this.finished) throw new Error('finished');
        this.put({ stdout: Util.shallowClone(message), time: Date.now() });
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
        }, { pause: 25 });
    }

    prompt<T = any>(prompt: Prompt<T>): Promise<T>;
    prompt<T = any>(prompt: Prompt<T>, waitResult: false): Promise<{ result: Promise<T>, clobbered: boolean; }>;
    prompt<T = any>(prompt: Prompt<T>, waitResult = true) {
        if (this.finished) throw new Error('finished');
        const { prompts } = this;
        const time = Date.now();
        const clobbered = (prompt.clobber || 'resolved' in prompt) && prompts[prompt.name];
        let { history: { length: index } } = this;
        if (clobbered) {
            const indexes = prompts[prompt.name].map(o => this.history.findIndex(i => i.prompt === o));
            index = indexes.pop()!;
            for (const index of indexes) this.history[index].prompt!.resolved = undefined;
            if (!Util.equals(this.history[index]!.prompt!, prompt)) {
                Object.assign(this.history[index]!.prompt!, prompt);
                this.put(this.history[index], index);
            }
        } else
            this.put({ prompt, time });
        const result = prompt[PromptResolved]!;
        return waitResult
            ? this.save().then(() => result)
            : this.save().then(() => ({ result, clobbered }));
    }

    async respond(value: any, name?: string, index?: number) {
        if (this.finished) throw new Error('finished')
        name ||= Object
            .values(this.prompts)
            .reduce((all, prompts) => [...all, ...prompts], [])
            .sort((a, b) => a[PromptIndex]! - b[PromptIndex]!)
            .shift()
            ?.name;
        if (!(name && this.prompts[name])) throw new Error(`unknown-prompt`);
        index ??= this.prompts[name][0][PromptIndex]!;
        const item = this.history[index];
        if ('resolved' in item.prompt!) throw new Error(`already-resolved`);
        item.prompt!.resolved = value;
        await item.prompt![PromptResolved]!;
        await this.save();
    }

}



