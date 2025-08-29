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
    get Service() { const { service } = this.terminal.input; return Util.findWhere(this.Services || [], { name: service }); }

    get Users() {
        const { service, table } = this.terminal.input;
        const users = this.terminal.history.filter(i => i.message?.type === 'users').map(item => item.message as Messaging.User.List).pop()?.users || [];
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
        const index = this.terminal.history.findIndex(m => m.message?.type === 'tables');
        const item: Messaging.Table.List['tables'] = this.terminal.history[index]?.message?.tables || [];
        type TTable = typeof item[number];
        class Table implements TTable {
            id!: string;
            seats!: Array<string | undefined>;
            standing!: string[];
            ready!: string[];
            service!: string;
            get empty() { return this.seats.length - this.sitting.length; }
            get users() { return [...this.sitting, ...this.standing]; }
            get sitting() { return this.seats.filter(Boolean) as string[]; }
            constructor(table: TTable) { Object.assign(this, table); }
        }
        return this.terminal.history.reduce((tables, item, i, arr) => {
            if (i > index && item.message?.type === 'user-status') {
                const { name, id, seats, seat, service } = item.message as Messaging.User.Status;
                let { status } = item.message as Messaging.User.Status;

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

                if (!table && /stood|table|sat|ready/.test(status) && !/created/.test(status)) {
                    console.error('anomaly-no-table', item, arr.slice(0, i));
                    debugger;
                }

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
        }, item.map(table => new Table(table)));
    }

    get ServiceStarted() { return !!this.ServiceActivity }

    get ServiceEnded(): Messaging.Service.End['results'] | undefined {
        const last = this.ServiceActivity?.pop();
        return last?.message?.type === 'end-service'
            && last.message.results
            || undefined;
    }

    get Won() { return this.ServiceEnded?.winners.includes(this.terminal.input.Name); }
    get Lost() { return this.ServiceEnded?.losers.includes(this.terminal.input.Name); }

    /** Service Terminal-Activity pertaining to the active Table */
    get ServiceActivity() {
        const { terminal } = this;
        const lastTableActivity = terminal.history.filter(h => h.type === 'prompt' && h.options!.name === 'table').pop();
        const table = lastTableActivity?.options?.resolved;
        const history: TerminalActivity[] = table ? terminal.history.slice(terminal.history.indexOf(lastTableActivity)) : [] as any;
        const serviceHistory = (history as Array<TerminalActivity<Messaging.Service.Start | Messaging.Service.End | Messaging.Service.Message<T>>>)
            .filter(m => m.message && ( // these messages are sent only to table members
                m.message.type === 'start-service'
                || m.message.type === 'end-service'
                || m.message.type === 'service-message'));
        const started: TerminalActivity<Messaging.Service.Start> = serviceHistory
            .filter(m => m.message!.type === 'start-service'
                && m.message!.table === table).pop() as any;
        const id = started?.message?.id;
        return serviceHistory.filter(m => m.message!.id === id);
    }

    get ServiceInstanceId() { return this.ServiceActivity?.[0].message?.id }

    get ServiceMessages(): T[] { return this.ServiceActivity?.filter(i => i.message!.type === 'service-message').map(i => (i.message as Messaging.Service.Message).message) || [] }

    get Results() { return Util.waitUntil(() => this.ServiceEnded!); }

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

    async SetService(name: string) {
        const { id } = Util.findWhere(this.Services!, { name: name })!;
        await this.terminal.answer({ service: id });
        await Util.waitUntil(() => this.terminal.input.service === id);
    }

}
