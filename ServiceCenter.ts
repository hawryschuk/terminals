/** Is an application which guides a user to :
 * 1) A service
 * 2) A table
 * 3) starts/stops the service
 * 4) applies service results ( ie: ratings, credits ) */

import { Util } from "@hawryschuk-common/util";
import { Terminal } from "./Terminal";
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
                this.registry[Util.UUID] = service;
        return this;
    }

    readonly terminals: Array<Terminal> = [];
    async join(terminal: Terminal) {
        if (this.terminals.includes(terminal)) throw new Error('already-joined');
        this.terminals.push(terminal);
        await terminal.send({
            type: 'services',
            services: Object
                .entries(this.registry)
                .map(([id, { NAME: name }]) => ({ id, name }))
        });
    }

    finished?: Date;
    finish() {
        this.finished ||= new Date;
        this.terminals.forEach(t => t.finish());
    }

    get Names() { return this.terminals.map(t => t.input.Name).filter(Boolean); }

    async broadcast(message: any) {
        const messaging = message?.type === 'message';
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

    private async maintain() {
        while (!this.finished) {
            for (const terminal of this.terminals) {

                /** Step 1 : Provide Name */
                if (!terminal.inputs.Name && !terminal.prompts.name && !terminal.prompts.Name) {
                    const { result } = await terminal.prompt({ type: 'text', name: 'name' }, false);
                    (async () => {
                        const name = await result;
                        if (this.Names.includes(name)) {
                            await terminal.send({ type: 'name-in-use', name });
                            await terminal.prompt({ type: 'text', name: 'name', resolved: '' });
                        } else {
                            await terminal.prompt({ type: 'text', name: 'Name', resolved: name });
                        }
                    })();
                }

                /** Step 2 :Prompt for a service */
                if (!terminal.input.service && !terminal.prompts.service) {
                    await terminal.prompt({
                        type: 'select',
                        name: 'service',
                        choices: Object
                            .entries(this.registry)
                            .map(([value, { NAME: title, USERS }]) => ({ value, title, USERS }))
                    }, false);
                }

                if (terminal.input.Name) {

                    /** Menu */
                    if (terminal.input.service) {
                        const prompted = !!terminal.prompts.menu;
                        const choices = () => {
                            const service = this.registry[terminal.input.service];
                            const table = Util.findWhere(this.tables, { id: terminal.input.table });
                            const seat = table && Util.findWhere(table.seats, { terminal });
                            const tables = Util.where(this.tables, { service });
                            const ListTables = async () => {
                                await terminal.send(<Messaging.Tables>{
                                    type: 'tables',
                                    tables: this.tables.map(table => ({
                                        id: table.id,
                                        empty: table.empty,
                                        seats: table.seats.length
                                    }))
                                })
                            };
                            const choices: Prompt['choices'] = [
                                {
                                    title: 'Create Table',
                                    disabled: !!table,
                                    value: async () => {
                                        const seats: number = await (async () => {
                                            if (typeof service.USERS === 'number')
                                                return service.USERS;
                                            else if (service.USERS instanceof Array)
                                                return await terminal.prompt({ type: 'select', name: 'seats', choices: service.USERS.map(seats => ({ title: `${seats}`, value: seats })) });
                                            else if (service.USERS === '*')
                                                return await terminal.prompt({ type: 'number', name: 'seats' });
                                        })();
                                        const table = new Table(service, seats, terminal);
                                        this.tables.push(table);
                                        await ListTables();
                                        await terminal.prompt({ type: 'text', name: 'table', resolved: table.id });
                                    }
                                },
                                {
                                    title: 'List Tables',
                                    disabled: !!table,
                                    value: ListTables
                                },
                                {
                                    title: 'Join Table',
                                    disabled: !!table || !tables.length || !!terminal.prompts.table,
                                    value: async () => {
                                        const id = await terminal.prompt({
                                            type: 'select',
                                            name: 'table',
                                            choices: tables.map((table, index) => ({
                                                value: table.id,
                                                title: `${index + 1}: ${table.empty} empty`,
                                            }))
                                        });
                                        const table = Util.findWhere(tables, { id })!;
                                        if (table) table.terminals.push(terminal);
                                        else await terminal.prompt({ type: 'text', resolved: '', name: 'table' });
                                    }
                                },
                                {
                                    title: 'Sit',
                                    disabled: !table || !!terminal.input.seat || table.full,
                                    value: async () => {
                                        const seat = table!.seats.find(s => !s.terminal)!;
                                        const index = table!.seats.indexOf(seat);
                                        if (seat) {
                                            seat.terminal = terminal;
                                            await terminal.prompt({ type: "number", name: 'seat', resolved: index + 1, clobber: true });
                                            table!.seats[index].terminal = terminal;
                                        } else {
                                            await terminal.send({ type: 'error', message: 'table-full' });
                                        }
                                    }
                                },
                                {
                                    title: 'Ready',
                                    disabled: !table || !seat || !!terminal.input.ready,
                                    value: async () => {
                                        await terminal.prompt({ type: 'number', name: 'ready', resolved: 1, clobber: true });
                                        if (table!.ready) table!.start();
                                    }
                                },
                                {
                                    title: 'Stand',
                                    disabled: !table || !terminal.input.seat || new ServiceCenterClient(terminal).ServiceStarted,
                                    value: async () => {
                                        if (terminal.input.ready) await terminal.prompt({ type: 'number', name: 'ready', resolved: 0 });
                                        await terminal.prompt({ type: "number", name: 'seat', resolved: 0 });
                                        const seat = Util.findWhere(table!.seats, { terminal })!;
                                        delete seat.terminal;
                                    }
                                },
                                {
                                    title: 'Leave Table',
                                    disabled: !table || !!seat,
                                    value: async () => {
                                        Util.removeElements(table!.seats, seat);
                                        Util.removeElements(table!.terminals, terminal);
                                        await terminal.prompt({ type: 'text', name: 'table', resolved: '' });
                                    }
                                },
                                {
                                    title: 'Message Everyone',
                                    disabled: !terminal.input.Name || !!terminal.prompts.message,
                                    value: async () => {
                                        const { result } = await terminal.prompt({ type: 'text', name: 'message', clobber: true }, false);
                                        (async () => {
                                            if (await result) {
                                                const message: Messaging.Message = {
                                                    type: 'message',
                                                    to: 'everyone',
                                                    from: terminal.input.Name,
                                                    message: await result,
                                                    id: '*',
                                                };
                                                this.broadcast(message);
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
                                                const message: Messaging.Message = {
                                                    type: 'message',
                                                    to: 'lounge',
                                                    from: terminal.input.Name,
                                                    message: await result,
                                                    id: terminal.input.service,
                                                };
                                                this.broadcast(message);
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
                                                const message: Messaging.Message = {
                                                    type: 'message',
                                                    to: 'table',
                                                    from: terminal.input.Name,
                                                    message: await result,
                                                    id: terminal.input.table,
                                                };
                                                this.broadcast(message);
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

                        /** A terminal can be busy and have only one unresolved menu prompt */
                        const { result } = await terminal.prompt({
                            type: 'select',
                            name: 'menu',
                            choices: choices()!.map(choice => ({ ...choice, value: choice.title })),
                            clobber: true,
                        }, false);


                        (async () => {
                            const title = await result;
                            const choice = Util.findWhere(choices()!, { title });
                            // console.log({ title, choice });
                            if (!prompted && choice && !choice.disabled) await choice.value();
                        })();
                    }
                }
            }
            await Util.pause(100);
        }
    }

}
