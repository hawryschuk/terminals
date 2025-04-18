import { Util } from '@hawryschuk/common';
import { DAO,Model } from '@hawryschuk/dao';
import { TerminalRestApiClient } from './TerminalRestApiClient';
import { Terminal } from './Terminal';
import { TerminalActivity } from './TerminalActivity';
import { Prompt } from './Prompt';

export class WebTerminal extends Terminal {

    static get TerminalRestApiClient() { return TerminalRestApiClient.httpClient! && TerminalRestApiClient; }
    static get Services() { return TerminalRestApiClient.services; }
    static get Terminals() { return TerminalRestApiClient.terminals; }
    static DAO = new DAO({ WebTerminal }); // for memcacheing WebTerminal instances 

    /** Retreive an existing terminal - claim ownership */
    public static async retrieve({ baseuri, service, instance, id, owner } = {} as {
        baseuri?: string;
        service: string;
        instance: string;
        id: string;
        owner?: any;
    }) {
        const info = await TerminalRestApiClient.getTerminalInfo(service, instance, id);
        if (info) {
            const existing: WebTerminal = await this.DAO.get(WebTerminal, id);
            const terminal: WebTerminal = existing || await this.DAO.create(WebTerminal, <any>{ ...info, owner: owner || info.owner, baseuri });
            if (!terminal.service || !terminal.instance) debugger;
            if (owner && !Util.equalsDeep(owner, info.owner)) await TerminalRestApiClient.getTerminalOwnership(service, instance, id, owner);
            terminal.maintain();
            return terminal;
        } else
            return null
    }

    /** Create a new terminal, optionally assigning ownership, and/or history */
    public static async createTerminal({ baseuri, service, instance, terminal, owner, history } = {} as {
        baseuri: string;
        service: string;
        instance: string;
        terminal: string;
        owner?: any;
        history?: TerminalActivity[];
    }): Promise<any> {
        await TerminalRestApiClient.createTerminal(service, instance, terminal);
        const terminal2 = await this.DAO.create(WebTerminal, <WebTerminal>{ history, baseuri, service, instance, id: terminal, owner });
        if (owner) await TerminalRestApiClient.getTerminalOwnership(service, instance, terminal, owner);
        if (history) await TerminalRestApiClient.setTerminalHistory(service, instance, terminal, history);
        terminal2.maintain();
        return terminal2;
    }

    /** WebTerminals synchronize with an online server through REST-API and WebSockets */
    public baseuri?: string;
    public service: string;
    public instance: string;
    public alive: number;

    //#region Expiration
    static readonly EXPIRATION = 2 * 60 * 1000; // 2 minutes : how much time until a terminal is deemed expired without any keep-alive updates
    static readonly KEEPALIVE = 1 * 60 * 1000;  // 1 minute : every minute , keep the terminal alive
    get age() { return new Date().getTime() - this.alive }
    get expired() { return this.age > WebTerminal.EXPIRATION || !!this.finished }
    get connected() { return !this.expired }
    async keepAlive() {
        if ((new Date().getTime() - this.alive) > 29500)    // expire in 2min, refresh every 1min, update after 30seconds
            await this.update$({ alive: new Date().getTime() });
    }
    //#endregion

    constructor({ id, owner, history, baseuri, service, instance, alive = new Date().getTime() } = {} as {
        id: string;
        owner?: any;
        history?: TerminalActivity[];
        baseuri?: string;
        service: string;
        instance: string;
        alive?: number;
    }, dao?: DAO) {
        super({ id, owner, history }, dao);
        this.baseuri = baseuri;
        this.service = service;
        this.instance = instance;
        this.alive = alive;
    }

    get synchronized() {
        return (async () => {
            const info = await TerminalRestApiClient.getTerminalInfo(this.service, this.instance, this.id);
            const [before, after] = [Util.deepClone({ ...this }), Util.deepClone({ ...this, ...info })]
            '_cached started baseuri alive'.split(' ').forEach(s => delete before[s] && delete after[s])
            const equals = Util.equalsDeep(before, after);
            return equals;
        })();
    }

    public async respond(value: any, name?: string, index?: number): Promise<{ name: string; index: number; value: any; }> {
        if (!TerminalRestApiClient.httpClient || !this.prompted) return await super.respond(value, name, index);
        // if (index === undefined) index = this.history.findIndex(item => item?.type === 'prompt' && !('resolved' in item.options) && (!name || name == item.options.name));
        // if (name === undefined) name = this.history[index]?.options?.name;
        const result = await TerminalRestApiClient.respondToPrompt(this.service, this.instance, this.id, value, name!, index!);
        if (!Util.equalsDeep(result, { name: name ?? result.name, index: index ?? result.index, value })) { debugger; throw new Error('name index value mismatch') }
        await Util.waitUntil(() => { return ('resolved' in (this.history[result.index]?.options || {})) });
        if (!Util.equalsDeep(value, this.history[result.index]!.options!.resolved)) throw new Error('unable to respond with that value');
        return result;
    }

    public async send(message: any) {
        if (!TerminalRestApiClient.httpClient) return await super.send(message);
        const { history: { length } } = await TerminalRestApiClient.send(this.service, this.instance, this.id, message);
        await Util.waitUntil(() => this.history?.length >= length);
    }

    public async prompt(options: Prompt) {
        if (!TerminalRestApiClient.httpClient) return await super.prompt(options);
        const { history: { length } } = await TerminalRestApiClient.prompt(this.service, this.instance, this.id, options);
        await Util.waitUntil(() => this.history.length >= length);
        await Util.waitUntil(() => 'resolved' in (this.history[length - 1]?.options || {}));
        return this.history[length - 1]!.options!.resolved;
    }

    /** TODO: Unclaim */
    async unclaim() { }

    async claim(_owner: any) {
        return await TerminalRestApiClient
            .getTerminalOwnership(this.service, this.instance, this.id, _owner)
            .then(({ owner }) => (this as Model).update$({ owner }))
    }

    /** Synchronize the last activity fetched online into this instance */
    private async synchronize() {
        const before = Util.deepClone(this.history);
        const index = this.prompted ? this.history.findIndex(i => i.options === this.prompted) : this.history.length;
        const after = [
            ...before.slice(0, index),
            ...await TerminalRestApiClient.getTerminalHistory(this.service, this.instance, this.id, index)
        ];
        const changed = !Util.equalsDeep(before, after);
        for (let i = 0; i < after.length; i++) {
            if (!Util.equalsDeep(before[i], after[i])) {
                await (this as Model).update$!({ history: Object.assign([...this.history], { [i]: after[i] }) });
                this.notify(this.history[i]);
            }
        }
        return { changed };
    }

    /** Maintain synchronicity with the state persisted in the online-server */
    private async maintain() {
        while (!this.finished) {
            if (!this.service || !this.instance) debugger;
            await this.synchronize().catch(error => {
                console.error('cannot synchronize webterminal, finishing it', error.message);
                return this.finish();
            });
            await Util.pause(750);
        }
    }
}
