/** Is an application which guides a user to :
 * 1) A service
 * 2) A table
 * 3) starts/stops the service
 * 4) applies service results ( ie: ratings, credits ) */

import { Util } from "@hawryschuk-common/util";
import { Terminal, TerminalActivity } from "./Terminal";
import { Mutex } from "@hawryschuk-locking/Mutex";
import { Prompt } from "./Prompt";
import { Table } from "./Table";
import { BaseService } from "./BaseService";
import { Messaging } from "./Messaging";
import { ServiceCenterClient } from "./ServiceCenterClient";
import { ServiceRobot } from "./ServiceRobot";

export class ServiceCenter {

    robots: Array<ServiceRobot> = [];

    tables: Table<BaseService>[] = [];

    users: Record<string, { terminal: Terminal } & Messaging.User.List['users'][number]> = {};

    constructor() { this.maintain().catch(e => { console.error(e); this.finish(); }); }

    /** Register each [unique] service with a unique ID */
    readonly registry: Record<string, typeof BaseService> = {};
    register(...services: Array<typeof BaseService>) {
        for (const service of services)
            if (!Object.values(this.registry).includes(service))
                this.registry[service.NAME] = service;
        return this;
    }

    readonly terminals: Array<Terminal> = [];
    async join(terminal: Terminal) {
        if (this.terminals.includes(terminal)) throw new Error('already-joined');
        this.terminals.push(terminal);
        await terminal.send<Messaging.Service.List>({
            type: 'services',
            services: Object
                .entries(this.registry)
                .map(([id, { NAME: name, USERS: seats, ALL_SERVICE_MESSAGES_BROADCASTED, CAN_RECONSTRUCT_STATE_FROM_SERVICE_MESSAGES, ROBOT }]) =>
                    ({ id, name, seats, ALL_SERVICE_MESSAGES_BROADCASTED, CAN_RECONSTRUCT_STATE_FROM_SERVICE_MESSAGES, ROBOT: !!ROBOT }))
        });

        /** The initial user list -- afterwards the client will augment on each incremental event */
        await terminal.send<Messaging.User.List>({
            type: 'users',
            users: this
                .terminals
                .map(({ input: { Name: name, service, table, seat, ready } }) => ({ name, service, table, seat, ready }))
                .filter(user => user.name)
        });

        /** The initial tables list -- afterwards the client will augment on each incremental event 
         * -- Sort of redundant as its mostly contained in Messaing.Users with the exception of ready status */
        await terminal.send<Messaging.Table.List>({
            type: 'tables',
            tables: this.tables.map(table => {
                const standing: string[] = table.standing.map(seat => seat.input.Name);
                const ready = table.sitting.filter(seat => seat.input.ready).map(seat => seat.input.Name);
                const robots = table.terminals.filter(terminal => Util.findWhere(this.robots, { terminal })).map(t => t.input.Name);
                const seats = new Array(table.seats).fill(undefined)
                    .map((val, index) => table.terminals.find(terminal => terminal.input.seat === index + 1)?.input.Name);
                return {
                    id: table.id,
                    service: table.service.NAME,
                    standing,
                    ready,
                    seats,
                    robots,
                };
            })
        });
    }

    finished?: Date;
    finish() {
        this.finished ||= new Date;
        this.terminals.forEach(t => t.finish());
    }

    get Names() { return this.terminals.map(t => t.input.Name).filter(Boolean); }

    async broadcast<T = any>(message: T) {
        const messaging = (message as any)?.type === 'message';
        const { to, id, from } = messaging ? message : {} as any;
        return await Promise.all(this
            .terminals
            .filter(terminal => {
                const { input } = terminal;
                return !messaging
                    || from === input.Name
                    || to === 'everyone'
                    || (to === 'direct' && input.Name === id)
                    || (to == 'lounge' && input.service === id)
                    || (to == 'table' && input.table === id)
            })
            .map(t => t.send(message))
        );
    }

    async Sat(terminal: Terminal, seat?: number) {
        const { input } = terminal;
        const { table: id, Name } = input;
        const table = Util.findWhere(this.tables, { id })!;
        const seated: number[] = table!.sitting.map(terminal => terminal.input.seat);
        const unseated = Util.without(Util.range(table!.seats), seated);
        seat ||= unseated[0];
        if (unseated.includes(seat)) {
            await terminal.prompt({ type: "number", name: 'seat', resolved: seat, clobber: true });
            await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'sat-down', name: Name, seat });
            this.users[Name].seat = seat;
            return true;
        } else if (table.full) {
            await terminal.send({ type: 'error', message: 'table-full' });
        } else if (seat && unseated.includes(seat)) {
            await terminal.send({ type: 'error', message: 'seat-taken' });
        }
        return false;
    }

    async LeaveService(terminal: Terminal) {
        const service = await this.GetService(terminal);
        const { Name } = terminal.input;
        if (service) {
            await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'left-service', name: Name, id: service.NAME });
            delete this.users[Name].service;
            return true;
        } else {
            return false;
        }
    }

    async JoinService(terminal: Terminal, service: string) {
        await terminal.prompt({ type: 'number', name: 'service', resolved: service });
        return await this.JoinedService(terminal);
    }

    async JoinedService(terminal: Terminal) {
        const service = await this.GetService(terminal);
        const { input } = terminal;
        const { Name } = input;
        if (service) {
            await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'joined-service', name: Name, id: service.NAME });
            this.users[Name].service = service.NAME;
            return true;
        } else if (!input.service) {
            await terminal.send({ type: 'error', message: 'service-undefined' });
            debugger;
        }
        return false;
    }

    async GetTables(terminal: Terminal) { return Util.where(this.tables, { service: await this.GetService(terminal) }); }

    async JoinTable(terminal: Terminal, table?: string) {
        table ||= await (async () => {
            return await terminal.prompt({
                type: 'select',
                name: 'table',
                clobber: true,
                choices: (await this.GetTables(terminal)).map((table, index) => {
                    const { id, sitting: { length: sitting }, standing: { length: standing }, empty, ready, running } = table;
                    return ({
                        value: table.id,
                        title: JSON.stringify({ id, sitting, standing, empty, ready, running, index }),
                    });
                })
            });
        })();

        await terminal.prompt({ type: 'number', name: 'table', resolved: table });
        return await this.JoinedTable(terminal);
    }

    async GetTable(terminal: Terminal) {
        const { table: id } = terminal.input;
        return Util.findWhere(this.tables, { id })!;
    }

    async JoinedTable(terminal: Terminal) {
        const table = await this.GetTable(terminal);
        const { Name } = terminal.input;
        if (table) {
            if (!table.terminals.includes(terminal)) {
                table.terminals.push(terminal);
                await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'joined-table', name: Name, id: table.id });
                this.users[Name].table = table.id;
                return true;
            } else {
                await terminal.send({ type: 'error', message: 'already-at-table' });
            }
        } else {
            await terminal.prompt({ type: 'text', resolved: '', name: 'table' });
            await terminal.send({ type: 'error', message: 'invalid-table' });
        }
        return false;
    }

    async Offline(terminal: Terminal) {
        const { Name: name, seat, ready, table, service } = terminal.input;
        if (ready) await this.Unready(terminal);
        if (seat) await this.Stand(terminal);
        if (table) await this.LeaveTable(terminal);
        if (service) await this.LeaveService(terminal);
        await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'offline', name });
        Util.removeElements(this.terminals, terminal);
        delete this.users[name];
    }

    async Online(terminal: Terminal, name: string) {
        if (!this.users[name]) {
            await terminal.prompt({ type: 'text', name: 'Name', resolved: name });
            await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'online', name });
            this.users[name] = { terminal, name };
            return true;
        } else if (name) {
            await terminal.send({ type: 'name-in-use', name });
        }
        return false;
    }

    async Unready(terminal: Terminal) {
        const { ready, Name } = terminal.input;
        if (ready) {
            await terminal.prompt({ type: 'number', name: 'ready', resolved: false, clobber: true });
            await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'unready', name: Name });
            this.users[Name].ready = false;
            return true;
        } else {
            await terminal.send({ type: 'error', message: 'not-ready' });
            return false;
        }
    }
    async GetService(terminal: Terminal) {
        const { service: serviceId } = terminal.input;
        const service = this.registry[serviceId];
        if (serviceId && !service) {
            await terminal.prompt({ type: 'text', name: 'service', resolved: '', clobber: true });
            await terminal.send({ type: 'error', message: 'invalid-service' });
        }
        return service;
    }

    async BootRobot(terminal: Terminal) {
        const table = await this.GetTable(terminal);
        const [robot] = table.sitting.map(terminal => Util.findWhere(this.robots, { terminal })).filter(Boolean);
        if (robot) {
            await this.Offline(robot.terminal);
            await robot.terminal.finish();
            Util.removeElements(this.robots, robot);
            return true;
        } else {
            await terminal.send({ type: 'error', message: 'no-robots-at-table' });
            return false;
        }
    }

    async InviteRobot(terminal: Terminal) {
        const table = await this.GetTable(terminal);
        const service = await this.GetService(terminal);
        const robotTerminal = new Terminal;
        const { Name } = terminal.input;
        await this.join(robotTerminal);
        this.Online(robotTerminal, (() => {
            let name, number = this.robots.length;
            while (this.Names.includes(name = `Robot ${++number}`)); { }
            return name;
        })());
        await this.JoinService(robotTerminal, service.NAME);
        await this.JoinTable(robotTerminal, table.id);
        await this.Sat(robotTerminal);
        await this.Ready(robotTerminal);
        await this.broadcast<Messaging.User.Status>({
            type: 'user-status',
            status: 'invited-robot',
            name: Name,
            id: robotTerminal.input.Name
        });
        this.robots.push(new (service.ROBOT as any)(robotTerminal));
        return true;
    }

    async LeaveTable(terminal: Terminal) {
        const { Name } = terminal.input;
        const table = await this.GetTable(terminal);
        if (table?.terminals.includes(terminal)) {
            Util.removeElements(table!.terminals, terminal);
            await terminal.prompt({ type: 'text', name: 'table', resolved: '', clobber: true });
            await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'left-table', name: Name });
            delete this.users[Name].table;
            return true;
        } else if (table) {
            await terminal.send({ type: 'error', message: 'not-at-table' });
        } else {
            await terminal.send({ type: 'error', message: 'not-at-a-table' });
        }
        return false;
    }

    async Stand(terminal: Terminal) {
        const { Name, seat, ready } = terminal.input;
        if (seat) {
            await terminal.prompt({ type: "number", name: 'seat', resolved: 0, clobber: true });
        } else {
            await terminal.send({ type: 'error', message: 'not-sitting' });
            return false;
        }
        if (ready)
            await this.Unready(terminal);
        this.users[Name].seat;
        await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'stood-up', name: Name });
        return true;
    }

    async CreateTable(terminal: Terminal, seats?: number) {
        const { service: serviceId, Name } = terminal.input;
        const service = this.registry[serviceId]!;
        seats ||= await (async () => {
            if (typeof service.USERS === 'number')
                return service.USERS;
            else if (service.USERS instanceof Array)
                return await terminal.prompt<number>({ type: 'select', name: 'seats', choices: service.USERS.map(seats => ({ title: `${seats}`, value: seats })) });
            else if (service.USERS === '*')
                return await terminal.prompt<number>({ type: 'number', name: 'seats' });
            else return undefined
        })();

        if (seats) {
            if (
                (service.USERS instanceof Array && !service.USERS.includes(seats))
                || (typeof service.USERS === 'number' && seats !== service.USERS)
            ) {
                await terminal.prompt<number>({ type: 'number', name: 'seats', resolved: 0, clobber: true });
                await terminal.send({ type: 'error', message: 'invalid-seats' });
                return false;
            }
            const id = Util.UUID;
            const table = new Table({ service, seats, creator: terminal, id });
            this.tables.push(table);
            await this.broadcast<Messaging.User.Status>({ type: 'user-status', name: Name, status: 'created-table', id, seats, service: serviceId });
            await terminal.prompt({ type: 'text', name: 'table', resolved: table.id });
            this.users[Name].table = table.id;
            return true;
        }
        return false;
    }

    async Ready(terminal: Terminal) {
        const service = await this.GetService(terminal);
        if (!service) return false;

        const table = Util.findWhere(this.tables, { id: terminal.input.table })!;
        if (!table) {
            await terminal.send({ type: 'error', message: 'invalid-table' });
            return false;
        }

        if (terminal.input.ready) {
            await terminal.send({ type: 'error', message: 'already-ready' });
            return false;
        }

        await terminal.prompt({ type: 'number', name: 'ready', resolved: true, clobber: true });

        const { Name } = terminal.input;
        await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'ready', name: Name });

        this.users[Name].ready = true;

        const id = Util.UUID;
        if (table!.ready) {
            await this.broadcast<Messaging.Service.Start>({
                type: 'start-service',
                id,
                table: table!.id,
                service: service.NAME,
                users: table!.sitting.map(t => t.input.Name)
            });

            table!
                .start(id)
                .then(async ({ winners, losers, error }) => {
                    await Promise.all(table!.sitting.map(async terminal => {
                        await terminal.prompt({ type: "number", name: 'ready', resolved: false, clobber: true });
                        await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'unready', name: terminal.input.Name });
                    }));
                    await this.broadcast<Messaging.Service.End>({
                        type: 'end-service',
                        table: table!.id,
                        id,
                        service: service.NAME,
                        results: {
                            error,
                            winners: winners.map(t => t.input.Name),
                            losers: losers.map(t => t.input.Name),
                        }
                    });
                })
                .catch(error => {
                    console.error(error);
                    debugger;
                })
                .finally(async () => {
                    const robots = this.robots.filter(robot => table.terminals.includes(robot.terminal));
                    for (const robot of robots) {
                        await this.Offline(robot.terminal);
                        await robot.terminal.finish();
                        Util.removeElements(this.robots, robot);
                    }
                });
        }
        return true;
    }

    /** Continuously go through each terminal , and service them : 
     * 1) Name registration
     * 2) Service Selection
     * 3) Menu
     * 4.1) Chat All/Service/Table/Direct
     * 4.2) Create/Join/Leave Table
     * 5) Sit/Stand
     * 6) Ready/Unready
     * 7) Start Service
     * 8) Distribute results
     */
    private async maintain() {
        while (!this.finished) {
            for (const terminal of this.terminals) {
                const { input, prompts } = terminal;

                /** Step 1 : Provide Name */
                if (!input.Name && !prompts.name) {
                    const { result } = await terminal.prompt({ type: 'text', name: 'name' }, false);
                    result.then(async (name: string) => this.Online(terminal, name));
                }

                /** Step 2 :Prompt for a service */
                else if (input.Name && !input.service && !prompts.service) {
                    const { result } = await terminal.prompt({
                        clobber: true,
                        type: 'select',
                        name: 'service',
                        choices: Object
                            .entries(this.registry)
                            .map(([value, { NAME: title, USERS }]) => ({ value, title, USERS }))
                    }, false);
                    result.then(() => this.JoinedService(terminal));
                }

                /** Step 3 : Repeat through the menu : Chat & Select-Table, Watch | Sit | Stand, Ready / Unready, Use-Service, Leave-Table, Offline */
                if (input.Name && input.service) {
                    /** Menu */
                    const prompted = !!prompts.menu;
                    const choices = () => {
                        const { input, prompts } = terminal;
                        const service = this.registry[input.service]!;
                        const table = Util.findWhere(this.tables, { id: input.table });
                        const tables = Util.where(this.tables, { service });
                        const choices: Prompt['choices'] = [
                            {
                                title: 'Create Table',
                                disabled: !!table || !!prompts.seats,
                                value: async () => { await this.CreateTable(terminal) }
                            },
                            {
                                title: 'Join Table',
                                disabled: !!table || !tables.length || !!prompts.table || !!prompts.seats,
                                value: async () => { await this.JoinTable(terminal); }
                            },
                            {
                                title: 'Sit',
                                disabled: !table || !!input.seat || table.full,
                                value: async () => { await this.Sat(terminal); }
                            },
                            {
                                title: 'Stand',
                                disabled: !table || !input.seat || table!.running,
                                value: async () => { await this.Stand(terminal); }
                            },
                            {
                                title: 'Invite Robot',
                                disabled: !table || table.full || !service.ROBOT,
                                value: async () => { await this.InviteRobot(terminal); }
                            },
                            {
                                title: 'Boot Robot',
                                disabled: !table || table.running || !table.sitting.some(terminal => Util.findWhere(this.robots, { terminal })),
                                value: async () => { await this.BootRobot(terminal); }
                            },
                            {
                                title: 'Ready',
                                disabled: !table || !input.seat || !!input.ready,
                                value: async () => { await this.Ready(terminal); }
                            },
                            {
                                title: 'Unready',
                                disabled: !table || !!table.running || !input.seat || !input.ready,
                                value: async () => { await this.Unready(terminal); }
                            },
                            {
                                title: 'Leave Table',
                                disabled: !table || !!input.seat,
                                value: async () => { await this.LeaveTable(terminal) }
                            },
                            {
                                title: 'Message Everyone',
                                disabled: !input.Name || !!prompts.message,
                                value: async () => {
                                    const { result } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                    (async () => {
                                        if (await result) {
                                            this.broadcast<Messaging.Chat>({
                                                type: 'message',
                                                to: 'everyone',
                                                from: input.Name,
                                                message: await result,
                                                id: '*',
                                            });
                                        }
                                    })();
                                },
                            },
                            {
                                title: 'Message Lounge',
                                disabled: !input.Name || !!prompts.message || !input.service,
                                value: async () => {
                                    const { result } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                    (async () => {
                                        if (await result) {
                                            this.broadcast<Messaging.Chat>({
                                                type: 'message',
                                                to: 'lounge',
                                                from: input.Name,
                                                message: await result,
                                                id: input.service,
                                            });
                                        }
                                    })();
                                },
                            },
                            {
                                title: 'Message Table',
                                disabled: !input.Name || !!prompts.message || !input.service || !input.table,
                                value: async () => {
                                    const { result } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                    (async () => {
                                        if (await result) {
                                            this.broadcast<Messaging.Chat>({
                                                type: 'message',
                                                to: 'table',
                                                from: input.Name,
                                                message: await result,
                                                id: input.table,
                                            });
                                        }
                                    })();
                                },
                            },
                            {
                                title: 'Direct Message',
                                disabled: !input.Name || !!prompts.message || !!prompts.to,
                                value: async () => {
                                    const { result: to } = await terminal.prompt({ type: 'text', name: 'to', clobber: true }, false);
                                    const { result: message } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                    Promise
                                        .all([to, message])
                                        .then(([to, message]) => {
                                            const recipient = this.users[to];
                                            const dm: Messaging.Chat = { to: 'direct', type: 'message', from: input.Name, id: to, message };
                                            if (recipient && message) {
                                                terminal.send(dm);
                                                recipient.terminal.send(dm);
                                            } else {
                                                terminal.send({ type: 'error', message: 'unknown-recipient' });
                                            }
                                        });
                                }
                            },
                            {
                                title: 'Leave Service',
                                value: () => this.LeaveService(terminal)
                            },
                            {
                                title: 'Offline',
                                value: () => this.Offline(terminal)
                            },
                            {
                                title: 'Refresh',
                                value: async () => { }
                            }
                        ];

                        return choices;
                    };

                    const { result, clobbered } = await terminal.prompt({
                        type: 'select',
                        name: 'menu',
                        choices: choices()!.map(choice => ({ ...choice, value: choice.title })),
                        clobber: true,
                    }, false);

                    /** Perform the menu action once */
                    if (!clobbered)
                        result.then(async (title: string) => {
                            const choice = Util.findWhere(choices()!, { title });
                            if (!prompted && choice && !choice.disabled) await choice.value();
                        });
                }
            }
            await Util.pause(100);
        }
    }

}
