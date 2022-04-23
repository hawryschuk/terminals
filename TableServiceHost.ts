import { DAO } from '@hawryschuk/dao';
import { Util } from '@hawryschuk/common';
import { WebTerminal } from "./WebTerminal";
import { Table } from './Table';
import { Service } from './Service';
import { TableService } from './TableService';
import { User } from './User';
import { Game as SpadesGame } from '@hawryschuk/spades-business';
import { Game as StockTickerGame } from '@hawryschuk/stock-ticker/business/game';
import { Game as TelefunkenGame } from '@hawryschuk/telefunken-business';
import { Terminal } from './Terminal';
import { TerminalActivity } from './TerminalActivity';

export class TableServiceHost {
    static agents: TableService[] = [];

    /** The services we will maintain */
    static services = [
        new Service({
            name: 'spades',
            seats: 4,
            generateService: async (table: Table) => new SpadesGame({ table, terminals: table.terminals })
        }),
        new Service({
            name: 'stock ticker',
            seats: 4,
            generateService: async (table: Table) => new StockTickerGame({ table, terminals: table.terminals })
        }),
        new Service({
            name: 'telefunken',
            seats: 4,
            generateService: async (table: Table) => new TelefunkenGame({ table, terminals: table.terminals })
        })
    ];

    /** Maintain all the table-service-agents -- make table-service-agents, make tables, run the table service, catch service results ( winners, losers ) and adjust results ( ratings/etc )*/
    static async maintain(dao: DAO) {
        // await Promise.all(Object.values(await dao.get<WebTerminal[]>(WebTerminal)).map(t => t.delete()));
        let created = 0;

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
                service.run(dao).catch(e => {
                    console.error(e?.message ?? e);
                });
                (async () => {
                    while (!terminal.owner && !terminal.finished) {
                        await terminal.keepAlive();
                        await Util.pause(1000);
                    }
                })();
            }
        };

        /** Monitor all existing WebTerminals */
        Object.values(await dao.get(WebTerminal)).forEach(terminal => monitor(terminal as WebTerminal));

        /** For the services that were interrupted : abort them */
        for (const service of this.services) {
            for (const table of service.tables) {
                if (table.ready && !table.serviceInstance) {
                    await table.abort('serviceInstance was aborted (server-restart)');  // this is necessary to release all the active-prompts from a service not running
                    // When the server restarts, the service is aborted, and a new service is generated reusing the same terminals from before
                    // A) The new service resets                : The service doesn't have enough information from the WebTerminals to fully construct itself (and resume), so it doesnt
                    // B) The new service resumes               : The service has enough information from the WebTerminal histories and does so
                    // C) The new service resumes on consensus  : The service knows it can fairly resume the previous service by estimating the unknown data through fair random scenario selection
                    // The service may define : nobody wins, nobody loses -- any ratings/digital-assets will need to be adjusted
                }
            }
        }

        while (true) { // every 2 seconds, check to create a new TableService WebTerminal, or Table objects for each service
            await Util.pause(2000);
            // console.log('maintain', new Date())
            const terminals: WebTerminal[] = Object.values(await dao.get(WebTerminal));

            /** Host.maintain() : Expired terminals : 1) Abort the table (agent.name takes loss), 2) Remove agent(from host), 3) Remove terminal (from dao) */
            // console.log('/** Host.maintain() : Expired terminals : 1) Abort the table (agent.name takes loss), 2) Remove agent(from host), 3) Remove terminal (from dao) */')
            for (const terminal of terminals.filter(t => t.expired)) {
                const index = TableServiceHost.agents.findIndex(a => a.terminal === terminal);
                if (index >= 0) {
                    const agent: TableService = TableServiceHost.agents[index];
                    const { table, seat, name } = agent;
                    TableServiceHost.agents.splice(index, 1);
                    terminals.splice(terminals.indexOf(terminal), 1);
                    await terminal.finish();
                    await terminal.delete!();
                    if (table) await table.abort(`${name} (#${seat?.position}) disconnected`);
                }
            }

            /** TableService.maintain() : Auto-update the prompt with different choices */
            for (const agent of TableServiceHost.agents) {
                const index = () => agent.terminal.history.indexOf(agent.terminal.promptedFor({ name: 'action', value: 'refresh' }) as TerminalActivity);
                while (index() >= 0 && !Util.equalsDeep(agent.choices, agent.terminal.history[index()]!.options!.choices))
                    await agent.terminal.respond('refresh', 'action', index());
            }

            /** Host.maintain() : Add a new Table-Service-Agent WebTerminal on-demand */
            // console.log('/** Host.maintain() : Add a new Table-Service-Agent WebTerminal on-demand */')
            if (!terminals.find(terminal => terminal.available)) {
                // console.log('create a new webterminal to the tableservice and wait for someone to connect to it');
                monitor(await dao.create(WebTerminal, { service: 'table-service', instance: `${new Date().getTime()}-${++created}` } as any));
            }

            /** Service.maintain() : Add a new Table for each Service that is lacking one */
            // console.log('/** Service.maintain() : Add a new Table for each Service that is lacking one */')
            for (const service of this.services) {
                if (!service.emptyTable) {
                    // console.log('no empty tables - creating');
                    service.tables.push(new Table({ service }));
                }
            }

            /** Table.maintain() : Generate a new service instance when a table is ready */
            // console.log('/** Table.maintain() : Generate a new service instance when a table is ready */')
            for (const service of this.services) {
                for (const table of service.tables) {
                    if (table.ready && !table.serviceInstance) {
                        console.log('a table is ready that needs a service instance generated')
                        await table.broadcast('serviceInstance has started');
                        table.serviceInstance = await service.generateService(table);
                        table.serviceInstance!
                            .run()
                            .then(async ({ winners = [], losers = [], error }) => {
                                await table.broadcast(`serviceInstance has stopped: ${JSON.stringify({ winners, losers, error })}`);
                                await User.record({
                                    error,
                                    winners: (await Promise.all(winners.map(async (name: string) => await dao.get<User>(User, name)))).filter(Boolean) as User[],
                                    losers: (await Promise.all(losers.map(async (name: string) => await dao.get<User>(User, name)))).filter(Boolean) as User[],
                                    service: service.name
                                });
                            })
                            .finally(() => delete (table as any).serviceInstance)
                        // TODO: use win/loss for ratings/etc
                    }
                }
            }

            /** Agent.maintain() : Compute the tables & lounge and deliver to every agent */
            // console.log('/** Agent.maintain() : Compute the tables & lounge and deliver to every agent */')
            for (const service of this.services) {
                // console.log('waiting until all agents', service.agents[0]?.user)
                await Util.waitUntil(() => service.agents.every(a => !!a.user));
                // console.log('/waiting')

                // console.log({service})
                try {
                    const tables = service.Tables;
                    const lounge = service.lounge;
                    // console.log({ service })
                    // Util.debug = true; Util.log({ tables, lounge })
                    // console.log(`${service.name} has ${service.agents.length} agents, and(${TableServiceHost.agents.length}) total agents(${TableServiceHost.agents.map(a => a.service)})`);
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
            // console.log('/Agent.maintain()')
        }
    }
}
