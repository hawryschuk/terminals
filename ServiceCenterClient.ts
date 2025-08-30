import { Util } from "@hawryschuk-common/util";
import { MinimalHttpClient } from "./MinimalHttpClient";
import { Messaging } from "./Messaging";
import { Terminal, TerminalActivity } from "./Terminal";
import { WebTerminal } from "./WebTerminal";
import { CachedWrapper } from "./CachedWrapper";

/** Service Center Client : Facilitates the operation of a Service Center : Connects via supplying either :
 * A) BASEURI to a remote Service Center
 * B) TERMINAL already connected to a Service Center ( local/remote application )
*/
export class ServiceCenterClient<T = any> {

    static async create({ terminal, httpClient, baseuri }: { terminal?: Terminal; httpClient?: MinimalHttpClient; baseuri?: string; } = {}) {
        terminal ||= (baseuri || httpClient)
            ? await WebTerminal.connect({ baseuri, httpClient })
            : new Terminal;
        if (terminal instanceof WebTerminal) {
            await terminal.request({ method: 'get', url: 'service', body: { id: terminal.id } });
        }
        return ServiceCenterClient.getInstance(terminal!);
    }

    /** Multiton pattern : Once Client instance for every Terminal
     * CachedWrapper : So getters() are executed once and cached */
    private static instances = new WeakMap<Terminal, ServiceCenterClient>;
    static getInstance<T = any>(terminal: Terminal): ServiceCenterClient<T> {
        return this.instances.get(terminal) || (() => {
            const instance = new ServiceCenterClient(terminal);
            const cached = new CachedWrapper(instance);
            terminal.subscribe({ handler: () => cached.ClearCache() });
            return this.instances
                .set(terminal, cached.proxy)
                .get(terminal)!
        })();
    }

    constructor(public terminal: Terminal) { }

    get NameInUse() { return this.terminal.prompts.name && !this.terminal.input.Name && this.terminal.history.some(i => i.message?.type === 'name-in-use'); }

    get Services() {
        const services = (this.terminal.history as TerminalActivity<Messaging.Service.List>[]).find(m => m.message?.type === 'services')?.message?.services;
        return services;
    }

    get Service() {
        const client = this;
        const { service: name } = this.terminal.input;
        const service = Util.findWhere(this.Services || [], { name });
        const Service = new class {
            get Instance() { return client.ServiceInstance }
            get Won() { return client.Won }
            get Lost() { return client.Lost }
        }
        return service
            ? Object.assign(Service, service) as typeof Service & typeof service
            : undefined;
    }

    get Users() {
        const { service, table } = this.terminal.input;
        const users = this.terminal
            .history
            .filter(i => i.message?.type === 'users')
            .map(item => item.message as Messaging.User.List)
            .pop()?.users || [];
        const messages = this.terminal
            .history
            .filter(m => m.type === 'stdout' && m.message?.type === 'user-status')
            .map(({ message, time }) => ({ ...message, time }) as Messaging.User.Status & { time: number; });
        const online = Array.from(messages.reduce(
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
                if (message.status === 'ready') users.get(message.name)!.ready = true;
                if (message.status === 'unready') users.get(message.name)!.ready = false;
                return users;
            },
            users.reduce((all, user) => {
                all.set(user.name, user)
                return all;
            }, new Map<string, typeof users[number]>())
        )
            .values());
        return new class Users {
            get Online() { return online }
            get Service() { return Util.where(this.Online, { service }); }
            get Table() { return Util.where(this.Service, { table }); }
            get Sitting() { return this.Table.filter(user => user.seat); }
            get Standing() { return this.Table.filter(user => !user.seat); }
            get Ready() { return this.Table.filter(user => user.ready); }
            get Unready() { return this.Table.filter(user => !user.ready); }
        }
    }

    get UserName(): string | undefined { return this.terminal.input.Name; }
    get User() { const { Name: name } = this.terminal.input; return Util.findWhere(this.Users.Online, { name }); }

    get Table() { return Util.findWhere(this.Tables, { id: this.terminal.input.table }); }

    get Messages() {
        const { service, table } = this.terminal.input;
        const messages = this.terminal
            .history
            .filter(m => m.type === 'stdout' && m.message?.type === 'message')
            .map(({ message, time }) => ({ ...message, time }) as Messaging.Chat & { time: number; });
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
        const message = this.terminal.history.filter(m => m.message?.type === 'tables').pop();
        const index = this.terminal.history.indexOf(message!);
        const item: Messaging.Table.List['tables'] = message?.message?.tables || [];
        type TTable = typeof item[number];
        class Table implements TTable {
            id!: string;
            seats!: Array<string | undefined>;
            standing!: string[];
            ready!: string[];
            service!: string;
            get full() { return !this.empty }
            get started() { return this.ready.length === this.seats.length; }
            get empty() { return this.seats.length - this.sitting.length; }
            get users() { return [...this.sitting, ...this.standing]; }
            get sitting() { return this.seats.filter(Boolean) as string[]; }
            constructor(table: TTable) { Object.assign(this, table); }
        }
        return this.terminal
            .history
            .reduce((tables, item, i, arr) => {
                if (index >= 0 && i > index && item.message?.type === 'user-status') {
                    const { name, id, seats, seat, service } = item.message as Messaging.User.Status;
                    const { status } = item.message as Messaging.User.Status;

                    if (status == 'created-table')
                        tables.push(new Table({
                            id: id!,
                            standing: [name],
                            seats: new Array(seats!).fill(undefined),
                            ready: [],
                            service: service!,
                        }));

                    const table = status === 'joined-table'
                        ? Util.findWhere(tables, { id })!
                        : tables.find(table => table.users.includes(name))!;

                    if ((status === 'stood-up' || status === 'offline' || status === 'left-table') && table.seats.includes(name))
                        table.seats[table.seats.indexOf(name)] = undefined;

                    if (status === 'stood-up')
                        table.standing.push(name);

                    if (status === 'offline' || status === 'left-table') {
                        if (table) {
                            Util.removeElements(table.standing, name);
                            Util.removeElements(table.ready, name);
                        } else if (status === 'left-table') {
                            console.error('anomaly-no-table', item);
                            debugger;
                        }
                    }

                    if (status === 'joined-table')
                        table.standing.push(name);

                    if (status === 'sat-down') {
                        table.seats[seat! - 1] = name;
                        Util.removeElements(table.standing, name);
                    }

                    if (status === 'ready')
                        table.ready.push(name);

                    if (status === 'unready')
                        Util.removeElements(table.ready, name);
                }
                return tables;
            }, item.map(table => new Table(Util.shallowClone(table))))
        // .filter(table => {
        //     table.service === this.Service?.id
        // });
    }

    get LargestTable() { return [...this.Tables].sort((a, b) => b.seats.length - a.seats.length).shift()?.seats || []; }

    get Won() { return this.ServiceInstance?.finished?.results?.winners.includes(this.terminal.input.Name); }
    get Lost() { return this.ServiceInstance?.finished?.results?.losers.includes(this.terminal.input.Name); }

    /** All instances ran for this service */
    get ServiceInstance() {
        const { Service } = this;
        const { UserName, Table } = this;
        const lastStatus = (this.terminal.history as TerminalActivity<Messaging.User.Status>[])
            .filter(h =>
                h.message?.type === 'user-status'
                && h.message.name == UserName
                && (h.message.status == 'joined-table'
                    || h.message.status == 'created-table'
                    || h.message.status == 'left-table'
                )
            )
            .pop();
        const history = Service && Table && lastStatus?.message
            && /joined|created/.test(lastStatus.message.status)
            && lastStatus.message.id === Table.id
            ? this.terminal.history.slice(this.terminal.history.indexOf(lastStatus))
            : [];
        let instance: undefined | {
            service: string;
            id: string;
            table: string;
            users: string[];
            finished?: Messaging.Service.End;
            messages: Messaging.Service.Message<T>['message'][];
        };
        for (const { message } of history) {
            const ss: Messaging.Service.Start = message,
                se: Messaging.Service.End = message,
                sm: Messaging.Service.Message = message;

            if (ss?.type === 'start-service' && ss.table === Table!.id)
                instance = {
                    service: ss.service,
                    id: ss.id,
                    table: ss.table,
                    users: ss.users,
                    finished: undefined,
                    messages: [],
                };

            else if (se?.type === 'end-service' && se.id === instance?.id)
                instance.finished = se;

            else if (sm?.type === 'service-message' && sm.id === instance?.id)
                instance.messages.push(sm.message);
        }
        return instance;
    }

    get Results() { return Util.waitUntil(() => this.ServiceInstance?.finished!); }

    get Menu() { return this.terminal.prompts.menu?.[0] }

    /** Redundant -- As the main loop will continue to update  */
    async RefreshMenu() { this.SelectMenu('Refresh'); }

    async SelectMenu(title: string) {
        const choice = await Util.waitUntil(() => {
            const choice = Util.findWhere(this.Menu?.choices! || [], { title })!;
            return choice && !choice.disabled ? choice : undefined;
        });
        await this.terminal.answer({ menu: choice!.value });
    }

    async UseNow() {
        if (this.Service && this.User) {
            if (!this.User!.seat) {
                if (this.Table && !this.Table.empty) {
                    await this.LeaveTable();
                }
                if (!this.Table) {
                    /** Choose the table that : 1) has empty seats , 2) has the least empty seats */
                    const availableTable = this.Tables
                        .filter(t => t.empty)
                        .sort((a, b) => a.empty - b.empty)
                        .shift();
                    if (availableTable) {
                        await this.JoinTable(availableTable.id);
                    } else {
                        const seats = this.Service.seats === '*' && 1
                            || this.Service.seats instanceof Array && Math.min(...this.Service.seats)
                            || this.Service.seats as number
                        await this.CreateTable(seats);
                    }
                }
                const Table = await Util.waitUntil(() => this.Table!);
                const seat = 1 + Table.seats.findIndex(occupant => !occupant);
                await this.Sit(seat);
            }
            if (!this.User.ready)
                await this.Ready();
        }
    }

    async CreateTable(seats?: number) {
        await this.SelectMenu('Create Table');
        const Service = this.Service;
        const willPromptForSeats = Service!.seats instanceof Array || Service!.seats === '*';
        const created = seats || !willPromptForSeats;
        if (seats && willPromptForSeats)
            await this.terminal.answer({ seats });
        if (created) {
            await Util.waitUntil(() => this.terminal.input.table as string);
            await Util.waitUntil(() => this.Table);
        }
        return { table: this.terminal.input.table };
    }

    async LeaveTable() {
        await this.SelectMenu('Leave Table');
        await Util.waitUntil(() => !this.terminal.input.table);
        await Util.waitUntil(() => !this.Table);
    }

    async JoinTable(id: string) {
        await this.SelectMenu('Join Table');
        await this.terminal.answer({ table: id });
        await Util.waitUntil(() => this.terminal.input.table === id);
        await Util.waitUntil(() => this.Table!.id === id);
    }

    async Sit(seat?: number) {
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

    async SetService(name: string) {
        const { id } = Util.findWhere(this.Services!, { name: name })!;
        await this.terminal.answer({ service: id });
        await Util.waitUntil(() => this.terminal.input.service === id);
    }

}
