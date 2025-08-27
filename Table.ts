import { Util } from "@hawryschuk-common/util";
import { Messaging } from "./Messaging";
import { Seat } from "./Seat";
import { BaseService } from "./BaseService";
import { Terminal } from "./Terminal";


export class Table<T extends BaseService> {
    seats!: Seat[];
    terminals!: Terminal[];
    id = Util.UUID;
    instance?: T;
    result?: Awaited<ReturnType<BaseService['start']>>;
    error?: Error;

    constructor(public service: typeof BaseService, seats: number, creator: Terminal) {
        this.seats = new Array(seats).fill(0).map(() => new Seat);
        this.terminals = [creator];
    }

    get finished() { return !!this.result; }
    get started() { return !!this.instance; }
    get running() { return this.started && !this.finished; }
    get empty() { return this.seats.filter(s => !s.terminal).length; }
    get full() { return !this.empty; }
    get ready() { return this.seats.every(s => s.terminal?.input.ready) && !this.running; }

    async broadcast(message: any) { return await Promise.all(this.terminals.map(t => t.send(message))); }

    async start() {
        await this.broadcast({ type: 'start-service' });
        this.instance = new (this.service as any)(this.seats);
        const { success, error } = (await this
            .instance!
            .start()
            .then(success => ({ success }))
            .catch(error => ({ error }))) as { error?: Error; success?: Messaging.ServiceResult["results"]; };
        this.result = success;
        this.error = error;
        delete this.instance;
        await this.broadcast(<Messaging.ServiceResult>{ type: 'end-service', results: success, error });
        await Promise.all(this.seats.map(seat => seat.terminal?.prompt({ type: "number", name: 'ready', resolved: 0, clobber: true })));
    }
}
