import { Terminal } from "./Terminal";
import { Messaging } from "./Messaging";
import { Table } from "./Table";
import { Util } from '@hawryschuk-common/util';
import { Prompt } from "./Prompt";
import { ServiceRobot } from "./ServiceRobot";

export abstract class BaseService<T = any> {
    static USERS: number | number[] | '*';
    static NAME: string;
    static RESERVED_PROMPT_VARS = ['name', 'Name', 'service', 'menu', 'table', 'seat', 'message'] as const;
    static ALL_SERVICE_MESSAGES_BROADCASTED = false;
    static CAN_RECONSTRUCT_STATE_FROM_SERVICE_MESSAGES = false;
    static ROBOT?: typeof ServiceRobot;

    get service() { return (this.constructor as typeof BaseService).NAME; }

    constructor(public table: Table<BaseService<T>>, public id = Util.UUID) { }

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

    async send<T = any>(message: T, recipients: Array<Terminal | string>) {
        const { id, service } = this;
        await Promise.all(recipients.map(recipient => {
            const terminal: Terminal = typeof recipient === 'string' ? this.terminals.find(t => t.input.Name === recipient)! : recipient;
            return terminal.send<Messaging.Service.Message>({
                type: 'service-message',
                message,
                service,
                id
            });
        }));
    }

    async prompt<S extends string>(
        user: string | Terminal,
        prompt: Prompt & { name: Exclude<S, typeof BaseService['RESERVED_PROMPT_VARS'][number]>; },

    ): Promise<any> {
        const terminal: Terminal = typeof user === 'string' ? this.terminals.find(t => t.input.Name === user)! : user;
        return await terminal.prompt(prompt);
    }
}
