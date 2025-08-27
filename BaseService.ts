import { Messaging } from "./Messaging";
import { Seat } from "./Seat";


export abstract class BaseService {
    static USERS: number | number[] | '*';
    static NAME: string;

    constructor(public seats: Seat[]) { }

    get terminals() { return this.seats.map(s => s.terminal!) }

    abstract start(): Promise<Messaging.ServiceResult['results']>;

    async broadcast(message: any) { return await Promise.all(this.terminals.map(terminal => terminal.send(message))); }
}
