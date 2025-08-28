import { Terminal } from "./Terminal";
import { Messaging } from "./Messaging";
import { Table } from "./Table";
import { Util } from '@hawryschuk-common/util';

export abstract class BaseService {
    static USERS: number | number[] | '*';
    static NAME: string;

    get service() { return (this.constructor as typeof BaseService).NAME; }

    constructor(public table: Table<BaseService>, public id = Util.UUID) { }

    get terminals() { return this.table.terminals; }

    get users() { return this.table.sitting; }

    abstract start(): Promise<{ winners: Terminal[]; losers: Terminal[]; error?: any; }>;

    async broadcast<T = any>(message: T) {
        const { id, service } = this;
        if (!this.terminals) debugger;
        return await Promise.all(this.terminals.map(terminal => terminal.send<Messaging.Service.Message>({
            type: 'service-message',
            message,
            service,
            id
        })));
    }

    async send<T = any>(message: T, ...recipients: Terminal[]) {
        const { id, service } = this;
        return await Promise.all(recipients.map(terminal => terminal.send<Messaging.Service.Message>({
            type: 'service-message',
            message,
            service,
            id
        })));
    }
}
