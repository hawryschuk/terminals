import { Util } from "@hawryschuk-common/util";
import { Messaging } from "./Messaging";
import { BaseService } from "./BaseService";
import { Terminal } from "./Terminal";


export class Table<T extends BaseService> {
    service!: typeof BaseService;
    id!: string;
    terminals!: Terminal[];
    seats!: number;

    instance?: T;
    result?: Awaited<ReturnType<BaseService['start']>>;

    constructor(options: { service: typeof BaseService; seats: number; creator: Terminal; id?: string; }) {
        const { creator, id = Util.UUID } = options;
        Object.assign(this, { ...options, id, terminals: [creator] });
    }

    get sitting() { return this.terminals.filter(terminal => terminal.input.seat) }
    get standing() { return this.terminals.filter(terminal => !terminal.input.seat) }
    get empty() { return this.seats - this.sitting.length }
    get full() { return this.empty === 0 }
    get ready() { return this.full && this.sitting.every(s => s.input.ready) }
    get running() { return !!this.instance && !this.finished; }
    get finished() { return !!this.result; }

    async start(id = Util.UUID) {
        this.instance = new (this.service as any)(this, id);
        this.result = <any>await this
            .instance!
            .start()
            .catch(error => {
                console.error(error);
                return ({ error, winners: [], losers: [] });
            });
        delete this.instance;
        return this.result!;
    }
}
