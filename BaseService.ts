import { Util } from '@hawryschuk/common';
import { WebTerminal } from './WebTerminal';
import { Terminal } from './Terminal';
import { Table } from './Table';

export abstract class BaseService {
    id!: string;
    table!: Table;

    constructor({
        id = `${new Date().getTime()}-${Util.UUID}`,
        table,
    } = {} as {
        id?: string;
        table: Table;
    }) {
        Object.assign(this, { table, id })
    }

    running?: Promise<any>;

    get terminals() { return this.table.terminals }

    async broadcast(message: any) { await Promise.all(this.terminals.filter(Boolean).map(terminal => terminal.send(message))); }

    abstract auto(): Promise<any>;

    onFinished?: Function;

    /** Service-Loop: Run the application entirety: Continuously run the auto until not !running !finished , ran by TableServiceHost.maintain() when a table becomes ready and a new serviceInstance is generated and run() is called */
    results?: { error?: any; winners?: string[]; losers?: string[]; };
    run() {
        return this.running ||= Util
            .pause(100)
            .then(async () => {
                delete this.results;
                while (this.running && !this.results) {
                    const results = await this
                        .auto()
                        .catch(error => {
                            console.error('error running service', error.message, error.stack);
                            return { error };
                        });
                    if (!(this.results ||= results)) await Util.pause(10);
                }
                if (this.onFinished) await this.onFinished();
                delete this.running;
                return this.results;
            })
    }

    /** A service is aborted for several reasons:
     * 1) Person abandons seat          -- 
     * 2) Person abandons terminal
     * 3) Service Host restarts, detects service-members, and service-instances that were running, aborts them and their terminal-prompts
     */
    public abort(reason = 'unknown') {
        const [, name, seat] = /^(.+) \(#(\d+)\) (stood up|disconnected)$/.exec(reason) || [];
        this.results ||= this.running && {
            error: reason,
            losers: [name],
            winners: this.terminals.filter(t => t && t.input.name !== name).map(t => t.input.name),
        } as any;
    }

    //#region asynchronous interactivity
    paused = false; speed = 20;
    async pause(ms: number) {
        this.paused = true;
        await Util.pause((ms || 1) / this.speed);
        this.paused = false;
    }
}
