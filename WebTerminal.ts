import { Util } from '@hawryschuk-common';
import { Terminal } from './Terminal';
import { TerminalActivity } from './TerminalActivity';
import { Prompt } from './Prompt';
import { MinimalHttpClient } from './MinimalHttpClient';
import { Mutex } from '@hawryschuk-locking/Mutex';
import { axiosHttpClient } from './axiosHttpClient';

export class WebTerminal extends Terminal {
    static REFRESH = 750;    /** (ms) Frequency to pull updates from the server */
    static httpClient: MinimalHttpClient;

    /** Create a new terminal, optionally assigning ownership, and/or history */
    public static async connect({ baseuri, id, owner, httpClient, refresh }: {
        baseuri?: string;
        id?: string;
        owner?: any;
        httpClient?: MinimalHttpClient;
        refresh?: number;
    } = {}) {
        const terminal = new WebTerminal({ id, baseuri, httpClient, refresh });
        Object.assign(terminal, await terminal.request({ method: 'get', url: `terminal`, body: { id, owner } }));
        await terminal.synchronize();
        terminal.maintain();
        return terminal;
    }

    private async maintain() {
        while (!this.finished) {
            await Util.pause(this.refresh);
            await this.synchronize();
        }
    }

    /** WebTerminals synchronize with an online server through REST-API and WebSockets */
    public baseuri?: string;
    public httpClient?: MinimalHttpClient;
    public refresh!: number;

    get request(): MinimalHttpClient {
        return this.httpClient
            || this.baseuri && axiosHttpClient(this.baseuri!)
            || WebTerminal.httpClient
            || undefined
    }

    constructor({ id, owner, history = [], httpClient, baseuri, refresh = WebTerminal.REFRESH }: {
        id?: string;
        owner?: any;
        history?: TerminalActivity[];
        baseuri?: string;
        refresh?: number;
        httpClient?: MinimalHttpClient
    }) {
        super({ id, owner, history });
        Object.assign(this, { baseuri, httpClient, refresh });
    }

    private atomic<T>(block: () => Promise<T>): Promise<T> { return Mutex.getInstance(`WebTerminal::${this.id}`).use({ block }); }

    override async send(message: any) {
        return await this.atomic(async () => {
            const { history: { length } } = this;
            await this.request({ method: 'put', url: `terminal/${this.id}`, body: { type: 'stdout', message } });
            await Util.waitUntil(() => this.history.length > length);
        });
    }

    override async prompt(options: Prompt, waitResult = true) {
        const { index } = await this.atomic(async () => {
            const { history: { length } } = this;
            await this.request({ method: 'put', url: `terminal/${this.id}`, body: { type: 'prompt', options } });
            return (await Util.waitUntil(() => {
                if (this.finished) throw new Error('finished');
                if (this.history.length > length) {
                    const index = this.history.findIndex((item, index) => index >= length && item.type === 'prompt' && item.options?.name === options.name);
                    if (index >= 0) return { index };
                }
            }))!;
        });

        const result = Util
            .waitUntil(() => {
                if (this.finished) throw new Error('finished');
                return 'resolved' in (this.history[index].options || {})
            })
            .then(() => this.history[index]!.options!.resolved)
        // .then(result => options.choices ? options.choices[result].value : result);

        return waitResult ? await result : { result };
    }

    override async respond(value: any, name?: string, index?: number) {
        return await this.atomic(async () => {
            const { history: { length } } = this;

            index ??= this.history.findIndex(item => item?.type === 'prompt' && item.options && !('resolved' in item.options!) && (!name || name == item.options!.name));
            if (!(index >= 0)) throw new Error('not-prompted');

            name ??= this.history[index]?.options?.name;
            if (this.history[index]?.options?.name !== name) throw new Error('not-prompted-for-same-name');

            await this.request({ method: 'post', url: `terminal/${this.id}/response`, body: { value, index, name } });

            const options = await Util.waitUntil(() => {
                if (this.finished) throw new Error('finished');
                const { options = {} } = this.history[index!] || {};
                return 'resolved' in options ? options : undefined;
            });

            if (options!.resolved !== value) throw new Error('resolved-with-something-else');

            this.notify(this.history[index]);
        });
    }

    override async finish() {
        await super.finish();
        await this.request({ method: 'delete', url: `terminal/${this.id}` });
    }

    /** Synchronize the last activity fetched online into this instance */
    private async synchronize() {
        const before = Util.deepClone(this.history);
        const index = this.prompted ? this.history.findIndex(i => i.options === this.prompted) : this.history.length;
        const after = [
            ...before.slice(0, index),
            ...await this
                .request({ method: 'get', url: `terminal/${this.id}/history?start=${index}` })
                .catch(e => { this.finish(); throw e; })
        ];
        const changed = !Util.equalsDeep(before, after);
        for (let i = 0; i < after.length; i++) {
            if (!Util.equalsDeep(before[i], after[i])) {
                await Object.assign(this, { history: Object.assign([...this.history], { [i]: after[i] }) }).save();
                this.notify(this.history[i]);
            }
        }
        return { changed };
    }

}
