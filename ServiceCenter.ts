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

export class ServiceCenter {

    tables: Table<BaseService>[] = [];

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
                .map(([id, { NAME: name, USERS: seats }]) => ({ id, name, seats }))
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
                const ready = table.sitting.map(seat => seat.input.ready);
                const seats = new Array(table.seats).fill(undefined)
                    .map((val, index) => table.terminals.find(terminal => terminal.input.seat === index + 1)?.input.Name);
                return {
                    id: table.id,
                    service: table.service.NAME,
                    standing,
                    ready,
                    seats,
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

                /** Step 1 : Provide Name */
                if (!terminal.inputs.Name && !terminal.prompts.name) {
                    const { result } = await terminal.prompt({ type: 'text', name: 'name' }, false);
                    result.then(async (name: string) => {
                        if (name && !this.Names.includes(name)) {
                            await terminal.prompt({ type: 'text', name: 'Name', resolved: name });
                            await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'online', name });
                        } else {
                            name && await terminal.send({ type: 'name-in-use', name });
                        }
                    });
                }

                /** Step 2 :Prompt for a service */
                else if (terminal.input.Name && !terminal.input.service && !terminal.prompts.service) {
                    const { result } = await terminal.prompt({
                        type: 'select',
                        name: 'service',
                        choices: Object
                            .entries(this.registry)
                            .map(([value, { NAME: title, USERS }]) => ({ value, title, USERS }))
                    }, false);

                    result.then((id: string) => this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'joined-service', name: terminal.input.Name, id }));
                }

                /** Step 3 : Repeat through the menu : Chat & Select-Table, Watch | Sit | Stand, Ready / Unready, Use-Service, Leave-Table, Offline */
                if (terminal.input.Name && terminal.input.service) {
                    /** Menu */
                    const prompted = !!terminal.prompts.menu;
                    const choices = () => {
                        const service = this.registry[terminal.input.service]!;
                        const table = Util.findWhere(this.tables, { id: terminal.input.table });
                        const tables = Util.where(this.tables, { service });
                        const { seat } = terminal.input;
                        const choices: Prompt['choices'] = [
                            {
                                title: 'Create Table',
                                disabled: !!table || !!terminal.prompts.seats,
                                value: async () => {
                                    const seats = await (async () => {
                                        if (typeof service.USERS === 'number')
                                            return service.USERS;
                                        else if (service.USERS instanceof Array)
                                            return await terminal.prompt<number>({ type: 'select', name: 'seats', choices: service.USERS.map(seats => ({ title: `${seats}`, value: seats })) });
                                        else if (service.USERS === '*')
                                            return await terminal.prompt<number>({ type: 'number', name: 'seats' });
                                        else return undefined
                                    })();
                                    if (seats) {
                                        const id = Util.UUID;
                                        const table = new Table({ service, seats, creator: terminal, id });
                                        this.tables.push(table);
                                        await this.broadcast<Messaging.User.Status>({ type: 'user-status', name: terminal.input.Name, status: 'created-table', id: table.id, seats, service: service.NAME });
                                        await terminal.prompt({ type: 'text', name: 'table', resolved: table.id });
                                    }
                                }
                            },
                            {
                                title: 'Join Table',
                                disabled: !!table || !tables.length || !!terminal.prompts.table || !!terminal.prompts.seats,
                                value: async () => {
                                    const id = await terminal.prompt({
                                        type: 'select',
                                        name: 'table',
                                        choices: tables.map((table, index) => {
                                            const { id, sitting: { length: sitting }, standing: { length: standing }, empty, ready, running } = table;
                                            return ({
                                                value: table.id,
                                                title: JSON.stringify({ id, sitting, standing, empty, ready, running, index }),
                                            });
                                        })
                                    });
                                    const table = Util.findWhere(tables, { id })!;
                                    if (table) {
                                        table.terminals.push(terminal);
                                        await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'joined-table', name: terminal.input.Name, id: table.id });
                                    } else {
                                        await terminal.prompt({ type: 'text', resolved: '', name: 'table' });
                                    }
                                }
                            },
                            {
                                title: 'Sit',
                                disabled: !table || !!seat || table.full,
                                value: async () => {
                                    const seated: number[] = table!.sitting.map(terminal => terminal.input.seat);
                                    const unseated = Util.without(Util.range(table!.seats), seated);
                                    const [seat] = unseated;
                                    if (seat) {
                                        await terminal.prompt({ type: "number", name: 'seat', resolved: seat, clobber: true });
                                        await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'sat-down', name: terminal.input.Name, seat });
                                    } else {
                                        await terminal.send({ type: 'error', message: 'table-full' });
                                    }
                                }
                            },
                            {
                                title: 'Ready',
                                disabled: !table || !seat || !!terminal.input.ready,
                                value: async () => {
                                    await terminal.prompt({ type: 'number', name: 'ready', resolved: true, clobber: true });
                                    await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'ready', name: terminal.input.Name });
                                    const id = Util.UUID;
                                    if (table!.ready) {
                                        await this.broadcast<Messaging.Service.Start>({
                                            type: 'start-service',
                                            id,
                                            table: table!.id,
                                            service: service.NAME,
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
                                            });
                                    }
                                }
                            },
                            {
                                title: 'Stand',
                                disabled: !table || !seat || table!.running,
                                value: async () => {
                                    if (terminal.input.ready) {
                                        await terminal.prompt({ type: 'number', name: 'ready', resolved: false, clobber: true });
                                        await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'unready', name: terminal.input.Name });
                                    }
                                    await terminal.prompt({ type: "number", name: 'seat', resolved: 0, clobber: true });
                                    await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'stood-up', name: terminal.input.Name });
                                }
                            },
                            {
                                title: 'Leave Table',
                                disabled: !table || !!seat,
                                value: async () => {
                                    Util.removeElements(table!.terminals, terminal);
                                    await terminal.prompt({ type: 'text', name: 'table', resolved: '', clobber: true });
                                    await this.broadcast<Messaging.User.Status>({ type: 'user-status', status: 'left-table', name: terminal.input.Name });
                                }
                            },
                            {
                                title: 'Message Everyone',
                                disabled: !terminal.input.Name || !!terminal.prompts.message,
                                value: async () => {
                                    const { result } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                    (async () => {
                                        if (await result) {
                                            this.broadcast<Messaging.Chat>({
                                                type: 'message',
                                                to: 'everyone',
                                                from: terminal.input.Name,
                                                message: await result,
                                                id: '*',
                                            });
                                        }
                                    })();
                                },
                            },
                            {
                                title: 'Message Lounge',
                                disabled: !terminal.input.Name || !!terminal.prompts.message || !terminal.input.service,
                                value: async () => {
                                    const { result } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                    (async () => {
                                        if (await result) {
                                            this.broadcast<Messaging.Chat>({
                                                type: 'message',
                                                to: 'lounge',
                                                from: terminal.input.Name,
                                                message: await result,
                                                id: terminal.input.service,
                                            });
                                        }
                                    })();
                                },
                            },
                            {
                                title: 'Message Table',
                                disabled: !terminal.input.Name || !!terminal.prompts.message || !terminal.input.service || !terminal.input.table,
                                value: async () => {
                                    const { result } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                    (async () => {
                                        if (await result) {
                                            this.broadcast<Messaging.Chat>({
                                                type: 'message',
                                                to: 'table',
                                                from: terminal.input.Name,
                                                message: await result,
                                                id: terminal.input.table,
                                            });
                                        }
                                    })();
                                },
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
