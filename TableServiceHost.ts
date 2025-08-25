import { Util } from '@hawryschuk-common';
import { WebTerminal } from "./WebTerminal";
import { Table } from './Table';
import { TableService } from './TableService';
import { User } from './User';
import { TerminalActivity } from './TerminalActivity';
import { ORM } from '@hawryschuk-crypto';
import { Service } from './Service';

/** A TableServiceHost :
 * 1) Knows each Services that available (ie; Spades, Canasta) 
 * 2) Ensures each Service has a table with vacancy 
 * 3) Grants entrants a Terminal to use */
export class TableServiceHost {
    static agents: TableService[] = [];

    /** The services we will maintain */
    static services: Service<any>[] = [
        // new Service({
        //     name: 'spades',
        //     seats: 4,
        //     generateService: async (table: Table) => new SpadesGame({ table, terminals: table.terminals })
        // }),
        // new Service({
        //     name: 'stock ticker',
        //     seats: 4,
        //     generateService: async (table: Table) => new StockTickerGame({ table, terminals: table.terminals })
        // }),
        // new Service({
        //     name: 'telefunken',
        //     seats: 4,
        //     generateService: async (table: Table) => new TelefunkenGame({ table, terminals: table.terminals })
        // })
    ];

    static terminals: WebTerminal[] = [];

    /** Maintain all the table-service-agents -- make table-service-agents, make tables, run the table service, catch service results ( winners, losers ) and adjust results ( ratings/etc )*/
    static async maintain(dao: ORM) {
        /** For a given terminal (WebTerminal) -- provide it with table service -- make its table -- execute Service.run() -- Keep it alive while unowned -- */
        const monitor = (terminal: WebTerminal) => {
            {   // auto-create the service table if it doesnt exist
                const service = this.services.find(s => s.name === terminal.input.service);
                while (terminal.input.table && service && !service.tables[parseInt(terminal.input.table) - 1]) {
                    service.tables.push(new Table({ service }));
                }
            } { // auto-resume TableService to the WebTerminals
                const service = new TableService(terminal);
                this.agents.push(service);
                service.run(dao).catch(e => { console.error(e?.message ?? e); });
            }
        };


        while (true) { // every 2 seconds, check to create a new TableService WebTerminal, or Table objects for each service
            await Util.pause(2000);
            const { terminals, agents } = this;

            /** Host.maintain() : Expired terminals : 1) Abort the table (agent.name takes loss), 2) Remove agent(from host), 3) Remove terminal (from dao) */
            for (const terminal of terminals.filter(t => t.finished)) {
                const index = agents.findIndex(a => a.terminal === terminal);
                const { table, seat, name } = agents[index];
                agents.splice(index, 1);
                terminals.splice(terminals.indexOf(terminal), 1);
                await terminal.finish();
                await terminal.delete!();
                if (table) await table.abort(`${name} (#${seat?.position}) disconnected`);
            }

            /** TableService.maintain() : Auto-update the prompt with different choices */
            for (const agent of agents) {
                const index = () => agent.terminal.history.indexOf(agent.terminal.promptedFor({ name: 'action', value: 'refresh' }) as TerminalActivity);
                while (index() >= 0 && !Util.equalsDeep(agent.choices, agent.terminal.history[index()]!.options!.choices))
                    await agent.terminal.respond('refresh', 'action', index());
            }

            /** Host.maintain() : Add a new Table-Service-Agent WebTerminal on-demand */
            if (!terminals.find(terminal => terminal.available)) {
                const terminal = new WebTerminal({ service: 'table-service', instance: `${new Date().getTime()}-${this.terminals.length + 1}` } as any);
                this.terminals.push(terminal);
                monitor(await dao.save(terminal));
            }

            /** Service.maintain() : Add a new Table for each Service that is lacking one */
            for (const service of this.services) {
                if (!service.emptyTable) {
                    service.tables.push(new Table({ service }));
                }
            }

            /** Table.maintain() : Generate a new service instance when a table is ready */
            for (const service of this.services) {
                for (const table of service.tables) {
                    if (table.ready && !table.serviceInstance) {
                        await table.broadcast('serviceInstance has started');
                        table.serviceInstance = await service.generateService(table);
                        table.serviceInstance!
                            .run()
                            .then(async results => {
                                const { winners = [], losers = [], error } = results!;
                                await table.broadcast(`serviceInstance has stopped: ${JSON.stringify({ winners, losers, error })}`);
                                await User.record({
                                    error,
                                    winners: (await Promise.all(winners.map(async (name: string) => await dao.retrieve(User, name)))).filter(Boolean) as User[],
                                    losers: (await Promise.all(losers.map(async (name: string) => await dao.retrieve(User, name)))).filter(Boolean) as User[],
                                    service: service.name
                                });
                            })
                            .finally(() => delete (table as any).serviceInstance)
                        // TODO: use win/loss for ratings/etc
                    }
                }
            }

            /** Agent.maintain() : Compute the tables & lounge and deliver to every agent */
            for (const service of this.services) {
                await Util.waitUntil(() => service.agents.every(a => !!a.user));
                try {
                    const tables = service.Tables;
                    const lounge = service.lounge;
                    for (const agent of service.agents) {
                        if (!Util.equalsDeep(agent.lounge, lounge)) {
                            agent.terminal.send(JSON.stringify({ lounge }))
                        }
                        if (!Util.equalsDeep(agent.tables, tables)) {
                            agent.terminal.send(JSON.stringify({ tables }))
                        }
                    }

                } catch (e) {
                    console.error(e);
                }
            }
        }
    }
}
