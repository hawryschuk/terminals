/** Is an application which guides a user to :
 * 1) A service
 * 2) A table
 * 3) starts/stops the service
 * 4) applies service results ( ie: ratings, credits ) */

import { Util } from "@hawryschuk-common";
import { Terminal } from "./Terminal";
import { Mutex } from "@hawryschuk-locking/Mutex";
import { Prompt } from "./Prompt";
import { Table } from "./Table";
import { BaseService } from "./BaseService";
import { Messaging } from "./Messaging";

export class ServiceCenter {

    tables: Table<BaseService>[] = [];

    constructor() { this.maintain().catch(e => { console.error(e); this.finish(); }); }

    /** Register each [unique] service with a unique ID */
    readonly registry: Record<string, typeof BaseService> = {};
    register(service: typeof BaseService) {
        if (!Object.values(this.registry).includes(service)) {
            this.registry[Util.UUID] = service;
        }
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

    async broadcast(message: any) { return await Promise.all(this.terminals.map(t => t.send(message))); }

    busy = new Set<Terminal>;
    private async maintain() {
        while (!this.finished) {
            for (const terminal of this.terminals) {

                /** Step 1 : Provide Name */
                if (!terminal.inputs.Name && !terminal.prompts.name) {
                    const { result } = await terminal.prompt({ type: 'text', name: 'name' }, false);
                    (async () => {
                        const name = await result;
                        Mutex.getInstance('ServiceCenter::Maintain::name').use({
                            block: async () => {
                                if (this.Names.includes(name)) {
                                    await terminal.send({ type: 'name-in-use', name });
                                } else {
                                    await terminal.prompt({ type: 'text', name: 'Name', resolved: name });
                                }
                            }
                        });
                    })();
                } else if (terminal.input.Name) {
                    /** Allow Lounge Messages */
                    if (!terminal.prompts.loungeMessage) {
                        const { result } = await terminal.prompt({ type: 'text', name: 'loungeMessage' }, false);
                        (async () => {
                            const message = await result;
                            if (message) {
                                const loungeMessage: Messaging.LoungeMessage = { type: 'loungeMessage', from: terminal.input.Name, message };
                                this.broadcast(loungeMessage);
                            }
                        })();
                    }

                    /** Prompt for a service */
                    if (!terminal.input.service && !terminal.prompts.service) {
                        await terminal.prompt({
                            type: 'select',
                            name: 'service',
                            choices: Object
                                .entries(this.registry)
                                .map(([value, { NAME: title, USERS }]) => ({ value, title, USERS }))
                        }, false);
                    }

                    /** Menu: */
                    else if (terminal.input.service && !terminal.prompts.menu && !this.busy.has(terminal)) {
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
                                title: 'List Tables',
                                disabled: !!table,
                                value: ListTables
                            },
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
                                    table.terminals.push(terminal);
                                }
                            },
                            {
                                title: 'Sit',
                                disabled: !table || !!terminal.input.seat || !table.empty || !!terminal.prompts.seat,
                                value: async () => {
                                    const seat = table!.seats.find(s => !s.terminal)!;
                                    const index = table!.seats.indexOf(seat);
                                    seat.terminal = terminal;
                                    await terminal.prompt({ type: "number", name: 'seat', resolved: index + 1 });
                                    table!.seats[index].terminal = terminal;
                                }
                            },
                            {
                                title: 'Ready',
                                disabled: !table || !seat || !!terminal.input.ready,
                                value: async () => {
                                    await terminal.prompt({ type: 'number', name: 'ready', resolved: 1 });
                                    if (table!.ready) await table!.start();
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
                            }
                        ];

                        /** A terminal can be busy and have only one unresolved menu prompt */
                        this.busy.add(terminal);
                        const { result } = await terminal.prompt({
                            type: 'list',
                            name: 'menu',
                            choices: choices.map((choice, index) => ({ ...choice, value: index }))
                        }, false);

                        (async () => {
                            const choice = choices[await result];
                            if (choice && !choice.disabled) await choice.value();
                            this.busy.delete(terminal);
                        })();
                    }
                }
            }
            await Util.pause(100);
        }
    }

}
