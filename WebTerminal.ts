import { Util } from '@hawryschuk/common';
import { MinimalHttpClient } from './MinimalHttpClient';
import { TerminalRestApiClient } from './TerminalRestApiClient';
import { Terminal } from './Terminal';
import { TerminalActivity } from './TerminalActivity';
import { Prompt } from './Prompt';
import { io } from 'socket.io-client';
import { DAO } from '@hawryschuk/dao';
// const WebSocket = require('ws');
declare var WebSocket: any;
declare var window: any;

export class WebTerminal extends Terminal {
    /** Retreive an existing terminal - claim ownership */
    static async retrieve({ wsuri, baseuri, service, instance, id, owner } = {} as {
        wsuri: string;
        baseuri: string;
        service: string;
        instance: string;
        id: string;
        owner?: any;
    }) {
        const info = await TerminalRestApiClient.getTerminalInfo(service, instance, id);
        const terminal = new WebTerminal({ ...info, owner: owner || info.owner, wsuri, baseuri });
        if (owner && !Util.equalsDeep(owner, info.owner)) await TerminalRestApiClient.getTerminalOwnership(service, instance, id, owner);
        terminal.maintain();
        return terminal;
    }

    /** Create a new terminal, optionally assigning ownership, and/or history */
    static async createTerminal({ wsuri, baseuri, service, instance, terminal, owner, history } = {} as {
        wsuri: string;
        baseuri: string;
        service: string;
        instance: string;
        terminal: string;
        owner?: any;
        history?: TerminalActivity[];
    }, dao: DAO = DAO.instance): Promise<any> {
        await TerminalRestApiClient.createTerminal(service, instance, terminal);
        const terminal2 = new WebTerminal({ wsuri, baseuri, service, instance, id: terminal, owner });
        if (owner) console.log('ownership: ', await TerminalRestApiClient.getTerminalOwnership(service, instance, terminal, owner));
        if (history) console.log('history set: ', await TerminalRestApiClient.setTerminalHistory(service, instance, terminal, history));
        terminal2.maintain();
        return terminal2;
    }

    /** WebTerminals synchronize with an online server through REST-API and WebSockets */
    public baseuri?: string;
    public wsuri?: string;
    public service: string;
    public instance: string;
    public socketIds: string[];
    public alive: number;

    /** age in ms since the webterminal was last kept alive */
    get age() { return new Date().getTime() - this.alive }

    get expired() { return this.age > WebTerminal.EXPIRATION }

    static readonly EXPIRATION = 2 * 60 * 1000; // 2 minutes : how much time until a terminal is deemed expired without any keep-alive updates
    static readonly KEEPALIVE = 1 * 60 * 1000;  // 1 minute : every minute , keep the terminal alive

    constructor({ id, owner, history, wsuri, baseuri, service, instance, socketIds = [], alive = new Date().getTime() } = {} as {
        id: string;
        owner?: any;
        history?: TerminalActivity[];
        baseuri?: string;
        wsuri?: string;
        service: string;
        instance: string;
        socketIds?: string[];
        alive?: number;
    }, dao?: DAO) {
        super({ id, owner, history }, dao);
        this.baseuri = baseuri;
        this.wsuri = wsuri;
        this.service = service;
        this.instance = instance;
        this.socketIds = socketIds;
        this.alive = alive;
    }

    get services() { return TerminalRestApiClient.services; }

    get info() { return TerminalRestApiClient.getTerminalInfo(this.service, this.instance, this.id); }

    async respond(value: any) {
        const { length } = this.history;
        const options = (): any => this.history[length - 1].options || {};
        await TerminalRestApiClient.respondToPrompt(this.service, this.instance, this.id, value);
        await Util.waitUntil(() => 'resolved' in options() && Util.equalsDeep(value, options().resolved));
    }

    async send(message: any) {
        console.log(this, 'send()', { message });
        const { history: { length } } = await TerminalRestApiClient.send(this.service, this.instance, this.id, message);
        await Util.waitUntil(() => this.history?.length >= length);
    }

    async prompt(options: Prompt) {
        const { history: { length } } = await TerminalRestApiClient.prompt(this.service, this.instance, this.id, options);
        await Util.waitUntil(() => this.history.length >= length);
        await Util.waitUntil(() => 'resolved' in (this.history[length - 1]?.options || {}));
        return this.history[length - 1]!.options!.resolved;
    }

    /** Synchronize the last activity fetched online into this instance */
    async synchronize({ last, history, start } = {} as { last?: TerminalActivity; history?: number; start?: number; }) {
        const before = Util.deepClone(this.history);
        if ((!!last && !!history && this.history.length === history! - 1)) {
            this.history.push(last!);
        } else if (!!last && this.history.length === history
            && !!this.prompted
            && (!!last.options && 'resolved' in last.options) // previous+resolved == current 
            && Util.equalsDeep(last, { ...this.last, options: { ...this.last.options, resolved: last.options.resolved } })
        ) {
            this.history.splice(-1, 1, last!);
        } else {
            const msLastPolled = new Date().getTime() - ((this as any)[Symbol.for('lastPolled')] ||= 0);
            if (!this.finished && msLastPolled > 10 * 1000) { // poll every 60 seconds to keep the webterminal alive 
                this.history = [
                    ...this.history.slice(0, this.history.length - (this.prompted ? 1 : 0)),
                    ...await TerminalRestApiClient.getTerminalHistory(this.service, this.instance, this.id, this.history.length - (this.prompted ? 1 : 0))
                ];
                (this as any)[Symbol.for('lastPolled')] = new Date().getTime();
            }

            const msLastPinged = new Date().getTime() - ((this as any)[Symbol.for('lastPinged')] ||= 0);
            if (this.connected && msLastPinged > 5 * 60 * 1000) { // ping every 5 minute to keep the websocket alive
                this.socket.send && this.socket.send(JSON.stringify({ action: 'ping' }));
                this.socket.emit && this.socket.emit('ping');
                (this as any)[Symbol.for('lastPinged')] = new Date().getTime();
            }
        }
        const changed = !Util.equalsDeep(before, Util.deepClone(this.history));
        if (changed) await this.notify();
        return { changed };
    }


    /** For maintaining a websocket connection */
    get connected() { return this.socket.readyState === 1 }
    set socket(v: any) { (this as any)[Symbol.for('socket')] = v }
    get socket() {
        return (this as any)[Symbol.for('socket')] ||= this.wsuri && (
            Util.safely(() => window) && !/localhost/.test(this.wsuri) && Util.safely(() => {  // ie; aws websockets - works with WebSocket but not socket.io-client
                return Object.assign(
                    new WebSocket(this.wsuri),
                    {
                        onmessage: (message: any) =>
                            this.synchronize(Util.safely(() => JSON.parse(message.data))),
                        onopen: () =>
                            this.socket.send(JSON.stringify({
                                action: 'terminal',
                                service: this.service,
                                instance: this.instance,
                                terminal: this.id,
                                owner: this.owner
                            })),
                        onerror: () => {
                            console.error('websocket errored!');
                            this.socket.close();
                        },
                        onclose: () => {
                            console.error('websocket closed - will reconnect');
                            this.socket = null;
                            this.socket;
                        },
                    }
                )
            })
            || io(this.wsuri, { path: this.wsuri.includes('localhost') ? '' : '/production', autoConnect: true, reconnection: true })             // nodejs/express/socket.io-server/command-line apps
                .on('message', message => this.synchronize(Util.safely(() => JSON.parse(message.data))))
                .on('connect', () => {                      // -- tell server our terminal-id
                    const { service, instance, id: terminal, owner } = this;
                    console.log('connected to the webockset server')
                    this.socket.emit('terminal', { service, instance, terminal, owner });
                })
        );
    }

    /** Maintain synchronicity with the state persisted in the online-server : 
     * a) WebSocket push notifications
     * b) REST-API Polling (1.25s)  **/
    async maintain() {
        if ((this as any)[Symbol.for('maintaining')]) return;
        else (this as any)[Symbol.for('maintaining')] = true;
        while (!this.finished) {
            await this.synchronize().catch(console.error);
            await Util.pause(1250);
        }
        if (this.socket?.disconnect) this.socket.disconnect();
        (this as any)[Symbol.for('maintaining')] = false;
    }
}