import { Util } from '@hawryschuk/common';
import { BaseService } from './BaseService';
import { TableService } from './TableService';
import { TableServiceHost } from "./TableServiceHost";
import { Seat } from "./Seat";
import { Service } from "./Service";

/** A Table contains multiple members, some are seated, and some are observing */
export class Table {
    constructor({ id = Util.UUID, service } = {} as { id?: string; service: Service; }) {
        Object.assign(this, { id, service, seats: new Array(service.seats).fill(null).map(() => new Seat(this)) });
    }

    id: string;
    service: Service;
    serviceInstance: BaseService;
    seats: Seat[];

    get names() { return this.seats.map((s, i) => s.occupant instanceof TableService ? s.occupant.name : `robot ${i + 1}`); }
    get terminals() { return this.seats.map(s => s.terminal) }
    get ready() { return this.full && this.seats.every(a => a.ready); }
    get empty() { return this.seats.every(seat => !seat.occupant) && this.members.length === 0; }
    get full() { return this.seats.every(seat => seat.occupant || seat.robot); }
    get observers() { return this.members.filter(m => !m.seat); }
    get members() { return TableServiceHost.agents.filter(a => a.table === this); }
    get index() { return this.service.tables.indexOf(this) }

    async broadcast(message: any) {
        if (this.terminals.filter(Boolean).length === 0) {
            return console.error('there are no terminals to broadcast to: ', message);
        }

        return await Promise.all(this.terminals.filter(Boolean).map(terminal => terminal.send(message)));
    }

    async abort(reason: string) {   // abort the serviceInstance, all its prompts, 
        if (this.serviceInstance) this.serviceInstance.abort(reason);

        for (const member of this.members) {
            const indexes = member.terminal.promptedActivity.map(item => member.terminal.history.indexOf(item));
            await Promise.all(indexes.map(index => member.terminal.respond(null, undefined, index)));
        }

        delete this.serviceInstance;
    }
}
