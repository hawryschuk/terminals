import { Util } from "@hawryschuk-common/util";
import { MinimalHttpClient } from "./MinimalHttpClient";
import { Messaging } from "./Messaging";
import { BaseService } from "./BaseService";
import { Terminal } from "./Terminal";
import { WebTerminal } from "./WebTerminal";
import { stat } from "fs";


export class ServiceCenterClient {
    constructor(public terminal: Terminal) { }

    get Users() {
        const { Tables, Table } = this;
        const { service, table } = this.terminal.input;
        const users = this.terminal.history.filter(i => i.message?.type === 'users').map(item => item.message as Messaging.Users).pop()?.users || [];
        const messages = this.terminal
            .history
            .filter(m => m.type === 'stdout' && m.message?.type === 'user-status')
            .map(({ message, time }) => ({ ...message, time }) as Messaging.UserStatus & { time: number; });
        return new class Users {
            get Online() {
                return Array.from(messages.reduce(
                    (users, message) => {
                        if (message.status === 'online') users.set(message.name, { name: message.name });
                        if (message.status === 'offline') users.delete(message.name);
                        if (message.status === 'joined-service') users.get(message.name)!.service = message.id;
                        if (message.status === 'left-service') users.get(message.name)!.service = undefined;
                        if (message.status === 'sat-down') users.get(message.name)!.seat = message.seat;
                        if (message.status === 'stood-up') users.get(message.name)!.seat = undefined;
                        if (message.status === 'joined-table') users.get(message.name)!.table = message.id;
                        if (message.status === 'left-table') users.get(message.name)!.table = undefined;
                        if (message.status === 'created-table') users.get(message.name)!.table = message.id;
                        return users;
                    },
                    users.reduce((all, user) => {
                        all.set(user.name, user)
                        return all;
                    }, new Map<string, typeof users[number]>())
                )
                    .values());
            }
            get Service() {
                return Util.where(this.Online, { service });
                // return messages.reduce((users, message) => {
                //     if (message.status === 'joined-service' && message.id === service) users.add(message.name);
                //     if (message.status === 'left-service' && message.id === service) users.delete(message.name);
                //     return users;
                // }, this.Online);
            }
            get Table() {
                return Util.where(this.Online, { table });
                // return Table?.users || [];
                // return messages.reduce((users, message) => {
                //     if (message.status === 'joined-table' && message.id === table) users.add(message.name);
                //     if (message.status === 'left-table' && message.id === table) users.delete(message.name);
                //     return users;
                // }, new Set<string>);
            }
            get Sitting() {
                return Table?.sitting || [];
                // return messages.reduce((users, message) => {
                //     if (message.status === 'sat-down' && message.id === table) users.add(message.name);
                //     if (message.status === 'stood-up' && message.id === table) users.delete(message.name);
                //     return users;
                // }, this.Table);
            }
            get Ready() {
                return Table?.ready || [];
                // return messages.reduce((users, message) => {
                //     if (message.status === 'ready' && message.id === table) users.add(message.name);
                //     if (message.status === 'unready' && message.id === table) users.delete(message.name);
                //     return users;
                // }, this.Table);
            }
            get Standing() {
                return Table?.standing || [];
                // return new Set(Util.removeElements([...this.Table], ...this.Sitting));
            }
            get Unready() {
                return Util.without(this.Sitting, this.Ready);
            }
        }
    }

    get Table() { return Util.findWhere(this.Tables, { id: this.terminal.input.table }); }

    get Messages() {
        const { service, table } = this.terminal.input;
        const messages = this.terminal
            .history
            .filter(m => m.type === 'stdout' && m.message?.type === 'message')
            .map(({ message, time }) => ({ ...message, time }) as Messaging.Message & { time: number; })
        return new class Messages {
            get Everyone() { return Util.where(messages, { to: 'everyone' }); }
            get Lounge() { return Util.where(messages, { to: 'lounge', id: service }); }
            get Table() { return Util.where(messages, { to: 'table', id: table }); }
            get Direct() { return Util.where(messages, { to: 'direct' }); }
        }
    }

    get Message() {
        const client = this;
        const { terminal } = client;
        return new class Message {
            async Everyone(message: string) {
                console.log('messaging everyone')
                await client.SelectMenu('Message Everyone');
                await terminal.answer({ message });
            }
            async Table(message: string) {
                await client.SelectMenu('Message Table');
                await terminal.answer({ message });
            }
            async Lounge(message: string) {
                await client.SelectMenu('Message Lounge');
                await terminal.answer({ message });
            }
        }
    }

    /** The Service Center will give Tables upon joining and subsequent User activity when it happens 
     * - And from that we can deduce the Users/Table status 
     */
    get Tables() {
        const index = this.terminal.history.findIndex(m => m.message?.type === 'tables');
        const item: Messaging.Tables['tables'] = this.terminal.history[index]?.message?.tables || [];
        type TTable = typeof item[number];
        class Table implements TTable {
            id!: string;
            sitting!: Array<string | undefined>;
            standing!: string[];
            ready!: string[];
            service!: string;
            get empty() { return this.sitting.length - this.sitting.filter(Boolean).length }
            get users() { return [...this.sitting, ...this.standing].filter(Boolean) as string[]; }
            constructor(table: TTable) { Object.assign(this, table); }
        }
        return this.terminal.history.reduce((tables, item, i) => {
            if (i > index && item.message?.type === 'user-status') {
                const { name, id, seats, seat, service } = item.message as Messaging.UserStatus;
                let { status } = item.message as Messaging.UserStatus;
                const table = tables.find(table => table.users.includes(name))!;
                if (status == 'created-table')
                    tables.push(new Table({
                        id: id!,
                        standing: [name],
                        sitting: new Array(seats!).fill(undefined),
                        ready: [],
                        service: service!,
                    }));

                if ((status === 'stood-up' || status === 'offline' || status === 'left-table') && table.sitting.includes(name))
                    table.sitting[table.sitting.indexOf(name)] = undefined;

                if (status === 'offline' || status === 'left-table') {
                    Util.removeElements(table.standing, name);
                    Util.removeElements(table.ready, name);
                }

                if (status === 'joined-table')
                    table.standing.push(name);

                if (status === 'sat-down') {
                    table.sitting[seat!] = name;
                    Util.removeElements(table.standing, name);
                }

                if (status === 'ready')
                    table.ready.push(name);

                if (status === 'unready')
                    Util.removeElements(table.ready, name);
            }
            return tables;
        }, item.map(table => new Table(table)));
    }

    get ServiceStarted() {
        const started = this.terminal.history.filter(m => m.message?.type == 'start-service').pop();
        const ended = this.terminal.history.filter(m => m.message?.type == 'end-service').pop();
        return !!started && (!ended || this.terminal.history.indexOf(ended) < this.terminal.history.indexOf(started));
    }

    get ServiceEnded(): Messaging.ServiceResult['results'] | undefined {
        const started = this.terminal.history.filter(m => m.message?.type == 'start-service').pop();
        const ended = this.terminal.history.filter(m => m.message?.type == 'end-service').pop();
        return !!ended && this.terminal.history.indexOf(ended) > this.terminal.history.indexOf(started!)
            ? ended.message.results
            : undefined;
    }

    get Won() { return this.ServiceEnded?.winners.includes(this.terminal.id); }
    get Lost() { return this.ServiceEnded?.losers.includes(this.terminal.id); }

    get State() {
        const { terminal } = this;
        const started = terminal.history.filter(m => m.message?.type == 'start-service').pop();
        const ended = terminal.history.filter(m => m.message?.type == 'end-service').pop();
        const state = terminal.history.filter(m => m.message?.type === 'state').pop();
        return started && state
            && (!ended || terminal.history.indexOf(started) > terminal.history.indexOf(ended))
            && terminal.history.indexOf(state) > terminal.history.indexOf(started)
            && state!.message!.state
    }

    get Results() {
        return Util.waitUntil(() => this.ServiceEnded!);
    }

    static async create({ terminal, httpClient, baseuri }: { terminal?: Terminal; httpClient?: MinimalHttpClient; baseuri?: string; } = {}) {
        terminal ||= (baseuri || httpClient)
            ? await WebTerminal.connect({ baseuri, httpClient })
            : new Terminal;
        if (terminal instanceof WebTerminal) {
            await terminal.request({ method: 'get', url: 'service', body: { id: terminal.id } });
        }
        return new ServiceCenterClient(terminal!);
    }

    get Menu() { return this.terminal.prompts.menu?.[0] }

    async RefreshMenu() {
        this.SelectMenu('Refresh');
    }

    async SelectMenu(title: string) {
        const choice = await Util.waitUntil(() => {
            const choice = Util.findWhere(this.Menu?.choices! || [], { title })!;
            return choice && !choice.disabled ? choice : undefined;
        });
        await this.terminal.answer({ menu: choice!.value });
    }

    async CreateTable(seats?: number) {
        await this.SelectMenu('Create Table');
        const Service = await this.Service;
        const willPromptForSeats = Service!.USERS instanceof Array || Service!.USERS === '*';
        if (seats && willPromptForSeats) await this.terminal.answer({ seats });
        if (seats || !willPromptForSeats) await Util.waitUntil(() => this.terminal.input.table as string);
        return { table: this.terminal.input.table, requiresSeats: willPromptForSeats && !seats };
    }

    async LeaveTable() {
        await this.SelectMenu('Leave Table');
        return await Util.waitUntil(() => !this.terminal.input.table);
    }

    async JoinTable(id: string) {
        await this.SelectMenu('Join Table');
        await this.terminal.answer({ table: id });
        await Util.waitUntil(() => this.terminal.input.table === id);
    }

    async Sit() {
        await this.SelectMenu('Sit');
        await Util.waitUntil(() => this.terminal.input.seat);
    }

    async Stand() {
        await this.SelectMenu('Stand');
        await Util.waitUntil(() => !this.terminal.input.seat);
    }

    async Ready() {
        await this.SelectMenu('Ready');
        await Util.waitUntil(() => this.terminal.input.ready);
    }

    async Name(name: string) {
        await this.terminal.answer({ name });
    }

    get Services() { return Util.waitUntil(() => (this.terminal.prompts2.service?.pop()?.choices)!); }
    get Service(): Promise<undefined | { value: string; title: string; USERS: (typeof BaseService)['USERS']; }> {
        return this.Services.then(services => services.find(service => service.value === this.terminal.input.service)) as any;
    }

    async SetService(title: string) {
        const { value: id } = Util.findWhere(await this.Services, { title })!;
        await this.terminal.answer({ service: id });
        await Util.waitUntil(() => this.terminal.input.service === id);
    }

    get NameInUse() {
        return this.terminal.prompts.name && this.terminal.history.some(i => i.message?.type === 'name-in-use');
    }

}
