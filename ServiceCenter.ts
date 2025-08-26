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

    async broadcast(message: any) { return await Promise.all(this.terminals.map(t => t.send(message))); }

    mute = false;
    muteLounge() { this.mute = true; return this; }

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
                    /** Allow Lounge Messages */
                    if (!terminal.prompts.loungeMessage && !this.mute) {
                        const { result } = await terminal.prompt({ type: 'text', name: 'loungeMessage', clobber: true }, false);
                        (async () => {
                            const message = await result;
                            if (message) {
                                const loungeMessage: Messaging.LoungeMessage = { type: 'loungeMessage', from: terminal.input.Name, message };
                                this.broadcast(loungeMessage);
                            }
                        })();
                    }

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
                                    disabled: !table || !!terminal.input.seat || table.full,
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
