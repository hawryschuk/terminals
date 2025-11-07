import { MinimalHttpClient } from '@hawryschuk-common/MinimalHttpClient';
import { axiosHttpClient } from '@hawryschuk-common/axiosHttpClient';
import { Util } from '@hawryschuk-common/util';
import { Terminal } from './Terminal';
import { TerminalActivity } from './TerminalActivity';
import { Prompt, PromptIndex, PromptResolved } from './Prompt';
import { Mutex } from '@hawryschuk-locking/Mutex';

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
        const url = id ? `terminal/${id}` : 'terminal';
        const terminal = new WebTerminal({ id, baseuri, httpClient, refresh });
        const online = await terminal.request({ method: 'get', url, body: { owner } });
        Object.assign(terminal, { ...online, history: [] });
        for (const item of online.history) await terminal.put(item);
        await terminal.synchronize();
        terminal.maintain();
        return terminal;
    }

    private async maintain() {
        try {
            while (!this.finished) {
                await Util.pause(this.refresh);
                await this.synchronize();
            }
        } catch (e) {
            console.error(e);
            await super.finish();
        }
    }

    /** WebTerminals synchronize with an online server through REST-API and WebSockets */
    public baseuri?: string;
    public httpClient?: MinimalHttpClient;
    public refresh!: number;

    get request(): MinimalHttpClient {
        const client = this.httpClient
            || this.baseuri && axiosHttpClient(this.baseuri!)
            || WebTerminal.httpClient
            || undefined;
        return client;
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

    override async send(stdout: any) {
        const { history: { length } } = this;
        await this.request({ method: 'put', url: `terminal/${this.id}`, body: { stdout } });
        await Util.waitUntil(() => this.history.length > length);
    }

    override async prompt<T = any>(prompt: Prompt<T>, waitResult = true) {
        const clobbered = (prompt.clobber || 'resolved' in prompt) && this.prompts[prompt.name];
        prompt = await this.atomic(async () => {
            const { index } = await this.request({ method: 'put', url: `terminal/${this.id}`, body: { prompt } });
            return await Util.waitUntil(() => { return this.history[index]?.prompt! });
        });
        const result = prompt![PromptResolved]!;
        return waitResult
            ? await result
            : { result, clobbered };

    }

    override async respond(value: any, name?: string, index?: number) {
        const item = await this.atomic(async () => {
            if (this.finished) throw new Error('finished')
            name ||= Object
                .values(this.prompts)
                .reduce((all, prompts) => [...all, ...prompts], [])
                .sort((a, b) => a[PromptIndex]! - b[PromptIndex]!)
                .shift()
                ?.name;
            if (!(name && this.prompts[name])) throw new Error(`unknown-prompt`);
            index ??= this.prompts[name].find(p => !p.timeResolved)?.[PromptIndex]!;
            const item = this.history[index];
            if (!item?.prompt) debugger;
            if (item.prompt?.timeResolved) throw new Error(`already-resolved`);
            await this.request({ method: 'post', url: `terminal/${this.id}/response`, body: { value, index, name } });
            return item;
        });
        return await item.prompt![PromptResolved]!;
    }

    override async finish() {
        const R = await this.request({ method: 'delete', url: `terminal/${this.id}` });
        const { finished, success } = R;
        if (finished) this.finished = finished;
        else debugger;
        return success;
    }

    /** Synchronize the last activity fetched online into this instance */
    private async synchronize() {
        const { prompted } = this;
        const index = prompted ? prompted[PromptIndex]! : this.history.length;
        const items: TerminalActivity[] = await this
            .request({ method: 'get', url: `terminal/${this.id}/history?start=${index}` })
            .catch(e => {
                if (e.finished) { this.finished = e.finished; return []; }
                else { console.error(e); throw e; }
            });
        for (let i = 0; i < items.length; i++) {
            this.put(items[i], index + i);
        }
    }

}
