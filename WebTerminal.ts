import { Util } from '@hawryschuk-common';
import { Terminal } from './Terminal';
import { TerminalActivity } from './TerminalActivity';
import { Prompt } from './Prompt';
import { MinimalHttpClient } from './MinimalHttpClient';
import { Mutex } from '@hawryschuk-locking/Mutex';
import { axiosHttpClient } from 'axiosHttpClient';

export class WebTerminal extends Terminal {
    static httpClient: MinimalHttpClient;

    /** Create a new terminal, optionally assigning ownership, and/or history */
    public static async connect({ baseuri, id, owner }: {
        baseuri?: string;
        id?: string;
        owner?: any;
    } = {}): Promise<any> {
        const httpClient = baseuri ? axiosHttpClient(baseuri) : this.httpClient;
        const data = await httpClient({ method: 'get', url: `terminal`, body: { id, owner } });
        const terminal = new WebTerminal({ ...data, baseuri });
        terminal.maintain();
        return terminal;
    }

    /** WebTerminals synchronize with an online server through REST-API and WebSockets */
    public baseuri?: string;

    get httpClient(): MinimalHttpClient { return (this as any)[Symbol.for('httpClient')] || WebTerminal.httpClient || this.baseuri && axiosHttpClient(this.baseuri!) || undefined }
    set httpClient(client: MinimalHttpClient) { (this as any)[Symbol.for('httpClient')] = client }

    constructor({ id, owner, history = [], baseuri }: {
        id: string;
        owner?: any;
        history?: TerminalActivity[];
        baseuri?: string;
    }) {
        super({ id, owner, history });
        this.baseuri = baseuri;
    }

    private atomic<T>(block: () => Promise<T>): Promise<T> { return Mutex.getInstance(`WebTerminal::${this.id}`).use({ block }); }

    public async send(message: any) {
        return await this.atomic(async () => {
            const { history: { length } } = this;
            await this.httpClient({ method: 'put', url: `terminal/${this.id}`, body: { type: 'stdout', message } });
            await Util.waitUntil(() => this.history.length > length);
        });
    }

    public async prompt(options: Prompt) {
        const { index } = await this.atomic(async () => {
            const { history: { length } } = this;
            await this.httpClient({ method: 'put', url: `terminal/${this.id}`, body: { type: 'prompt', options } });
            return (await Util.waitUntil(() => {
                if (this.finished) throw new Error('finished');
                if (this.history.length > length) {
                    const index = this.history.findIndex((item, index) => index >= length && item.type === 'prompt' && item.options?.name === options.name);
                    if (index >= 0) return { index };
                }
            }))!;
        });
        await Util.waitUntil(() => {
            if (this.finished) throw new Error('finished');
            return 'resolved' in (this.history[index].options || {})
        });
        return this.history[index]!.options!.resolved;
    }

    public async respond(value: any, name?: string, index?: number): Promise<{ name: string; index: number; value: any; }> {
        return await this.atomic(async () => {
            const { history: { length } } = this;

            index ??= this.history.findIndex(item => item?.type === 'prompt' && item.options && !('resolved' in item.options!) && (!name || name == item.options!.name));
            if (!(index >= 0)) throw new Error('not-prompted');

            name ??= this.history[index]?.options?.name;
            if (this.history[index]?.options?.name !== name) throw new Error('not-prompted-for-same-name');

            await this.httpClient({ method: 'post', url: `terminal/${this.id}/response`, body: { value, index, name } });

            const options = await Util.waitUntil(() => {
                if (this.finished) throw new Error('finished');
                const { options = {} } = this.history[index!] || {};
                return 'resolved' in options ? options : undefined;
            });

            if (options!.resolved !== value) throw new Error('resolved-with-something-else');

            this.notify(this.history[index]);

            return { name: name!, index, value };
        });
    }

    async finish() {
        await this.httpClient({ method: 'delete', url: `terminal/${this.id}` });
        await super.finish();
    }

    /** Synchronize the last activity fetched online into this instance */
    private async synchronize() {
        const before = Util.deepClone(this.history);
        const index = this.prompted ? this.history.findIndex(i => i.options === this.prompted) : this.history.length;
        const after = [
            ...before.slice(0, index),
            ...await this.httpClient({ method: 'get', url: `terminal/${this.id}/history?start=${index}` })
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

    /** Maintain synchronicity with the state persisted in the online-server */
    private async maintain() {
        while (!this.finished)
            await this
                .synchronize()
                .then(() => Util.pause(WebTerminal.REFRESH))
                .catch(error => { super.finish(); throw error; });
    }

    /** (ms) Frequency to pull updates from the server */
    static REFRESH = 750;
}
