import express from 'express';
import { Util } from '@hawryschuk/common';
import { DynamoDBDAO } from '@hawryschuk/dao-aws';
import { WebTerminal } from './WebTerminal';
import DDBMutex from '@hawryschuk/resource-locking/ddb.mutex';

export const atomic = (resource: string, block: any) => DDBMutex
    .getInstance({ TableName: 'test', resource })
    .use({ block });

/** The "Terminal Services Rest API Server" is a REST-API Server Application, using Node-Express,
 * that allows for applications interacting with one or more users online through WebTerminal objects.
 * 
 * The WebTerminal object is a client of this server, keeping the WebTerminal persisted online through
 * period updates, and when given a push-notification that the Terminal has new activity.
 * 
 * Features:
 * 1) Create a web terminal
 * 2) - Update terminal history
 * 3) Claim ownership of a terminal
 * 4) Un-Claim ownership of a terminal
 * 5) Write to the terminal      ( App    --> STDOUT  )
 * 6) Read the terminal history  ( STDOUT --> User    )
 * 7) Prompt for input           ( App    --> STDIN   )
 * 8) Respond to Input-Prompt    ( User   --> STDIN   )
 * 9) List free terminals
 * 10) Send Push-Notifications to WebSockets observing WebTerminals that are changed 
 * 11) Delete a terminal
 * 12) Auto-delete terminals that expire
 * 
 * Features via Technical-Debt
 * 1) Atomic operations on the persisted-data ( to prevent bugs from write-clobbers )
 * */
export class TerminalRestApiServer2 {
    wsuri?: string;                     // sometimes the rest-api server knows better than the client what the WebSocket endpoint is
    notifySocket: Function;             // Q: given a socketId , how do we notify it? A: Inversion of Control! varies by host, ie; AWS API Gateway WebSocket, Azure, GCP
    static models = { WebTerminal };    // The data models used by this server that are persisted online 
    constructor(
        private dao = new DynamoDBDAO(TerminalRestApiServer2.models),
        private atomic = (resource: string, block: any) => DDBMutex
            .getInstance({ TableName: 'test', resource })
            .use({ block })
    ) {
        // DAO.cacheExpiry = 0;
    }

    async notify(terminal: WebTerminal) {
        console.log('notifying', terminal.socketIds);
        await Promise.all(terminal
            .socketIds.map(socketId => this
                .notifySocket(socketId, {
                    last: terminal.last,
                    history: terminal.history.length
                }).catch(e => null)));
    }

    get terminals(): Promise<WebTerminal[]> {
        return this
            .dao.get<WebTerminal[]>(WebTerminal)
            .then(Object.values)
            .then(terminals => terminals.filter(terminal => {
                if (terminal.expired) this.dao.delete(WebTerminal, terminal.id).catch(async e => null);
                else return true;
            }));
    }

    get services() {
        return this.terminals.then(terminals => {
            const reduced = terminals.reduce(
                (services, _terminal) => {
                    const { id, owner, started, finished, socketIds, history, service: serviceId, instance: serviceInstanceId } = _terminal;

                    const service = Util.findWhere(services, { serviceId }) || { serviceId, instances: [] };
                    if (!services.includes(service)) services.push(service);

                    const instance = Util.findWhere(service.instances, { serviceInstanceId }) || { serviceInstanceId, terminals: [] };
                    if (!service.instances.includes(instance)) service.instances.push(instance);

                    instance.terminals.push(_terminal);

                    return services;
                },
                [] as {
                    serviceId: string;
                    instances: {
                        serviceInstanceId: string;
                        terminals: WebTerminal[];
                    }[]
                }[]
            );
            return reduced;
        });
    }

    /** invoked when the terminal info is queried (history/periodic-updates) */
    async keepAlive(terminal: WebTerminal) {
        if ((new Date().getTime() - terminal.alive) > 29500)    // expire in 2min, refresh every 1min, update after 30seconds
            await this.atomic(`TerminalServer::WebTerminal::${terminal.id}`, async () => {
                await this.dao.update(WebTerminal, terminal.id, { alive: new Date().getTime() });
            });
    }

    /** Terminal Services : Node-Express REST API App : Deployable to Serverless AWS/Azure/GCP, localhost, and on-prem/co-loc */
    expressApp = express()
        .use(require('cors')({ origin: true }))
        .use(require('body-parser').json())
        .use(async (req, res, next) => {
            await Util.waitUntil(() => this.notifySocket);
            res.append('x-terminal-rest-api-version', '1.0.0');
            next();
        })
        .use('/', express.static('frontend'))

        /** What the WebSockets URI is */
        .get('/wsuri', (req, res) => res.status(200).json({ wsuri: this.wsuri }))

        /** 1) know.services */
        .get('/services', async (req, res) => {         // { id, description, instances:[{id,started,finished,terminals:[{id,owner,started,finished,history}...]}...] }[]
            const services = await this.services;
            for (const service of services)
                for (const instance of service.instances)
                    instance.terminals = instance.terminals.map(terminal =>
                        terminal.POJO()) as any;
            res.status(200).json(services)
        })

        .get('/terminals', async (req, res) => {         // { id, description, instances:[{id,started,finished,terminals:[{id,owner,started,finished,history}...]}...] }[]
            res.status(200).json(await this.terminals.then(t => t.map(t => t.POJO())));
        })

        /** 1) Create a new terminal : As an externally running application, I want to interface with users online, and will create WebTerminals to do so */
        .post('/services/:service_id/:instance_id/terminals/:terminal_id', async (req, res) => {
            const { service_id, instance_id, terminal_id } = req.params;
            const { owner } = req.body;
            const terminal: WebTerminal = await this.dao.create(
                WebTerminal,
                new WebTerminal({
                    service: service_id,
                    instance: instance_id,
                    id: terminal_id,
                    ...(owner ? { owner } : {})
                }, this.dao)
            );
            res.status(204).json(terminal.POJO());
        })

        /** 2) claim-terminal-[promptee]-ownership  <--  1) know-services-instances-terminals */
        .put('/services/:service_id/:instance_id/terminals/:terminal_id/owner', async (req, res) => {
            const { terminal_id } = req.params;
            const { owner } = req.body;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                if (terminal) {
                    await this.dao.update(WebTerminal, terminal_id, { owner });
                    res.status(200).json(terminal.POJO());
                } else {
                    res.status(403).end();
                }
            });
        })

        /** 3) promptee-reads-terminal-history */
        .get('/services/:service_id/:instance_id/terminals/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            const terminal = await this.dao.get<WebTerminal>(WebTerminal, terminal_id);
            await this.keepAlive(terminal);
            res.status(200).json(terminal.POJO());
        })

        /** 3.2) [OPTIONAL] promptee reads subsequent terminal history after a certain ?start point */
        .get('/services/:service_id/:instance_id/terminals/:terminal_id/history', async (req, res) => {
            const { start } = req.query as any;
            const { terminal_id } = req.params;
            const terminal = await this.dao.get<WebTerminal>(WebTerminal, terminal_id);
            await this.keepAlive(terminal);
            const { history = [] } = terminal || {};
            res.status(200).json(history.slice(parseInt(start)));
        })

        /** WebTerminal Creator overwrites the history (usually in initialization) */
        .put('/services/:service_id/:instance_id/terminals/:terminal_id/history', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                const history = req.body;
                console.log('received history for terminal ', history);
                await this.dao.update(WebTerminal, terminal_id, { history });
                res.status(200).json(terminal.POJO());
            });
        })

        /** 5) promptee terminates-connection/relenquishes-ownership */
        .delete('/services/:service_id/:instance_id/terminals/:terminal_id/owner', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                if (terminal) await this.dao.update(WebTerminal, terminal_id, { owner: undefined });
                res.status(200).json(terminal.POJO());
            });
        })

        /** Promptee responds to a prompt */
        .post('/services/:service_id/:instance_id/terminals/:terminal_id/response', async (req, res) => {
            console.log('POST .../terminal/response ');
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                if (terminal) {
                    if (terminal.last.type !== 'prompt')
                        res.status(500).json({ error: 'not-prompted' });
                    else if ('resolved' in terminal.last.options)
                        res.status(500).json({ error: 'already-resolved' });
                    else if (terminal.prompted) {
                        console.log('posting response -- then notify');
                        terminal.prompted.resolved = req.body.response;
                        await this.dao.update(WebTerminal, terminal.id, { history: terminal.history });
                        await this.notify(terminal);
                        res.status(200).json(terminal.POJO());
                    }
                }
            });
        })

        /** Put to an existing terminal : prompt, stdout */
        .put('/services/:service_id/:instance_id/terminals/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                if (terminal) {
                    await this.dao.update(WebTerminal, terminal_id, { history: [...terminal.history, req.body] });
                    await this.notify(terminal); // push-notification through existing websocket 
                    res.status(200).json(terminal.POJO());
                } else {
                    res.status(404).json({ error: 'non-existent-terminal' });
                }
            });
        })

        .delete('/services/:service_id/:instance_id/terminals/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
            const removedElements = terminal && await this.dao.delete(WebTerminal, terminal_id);
            if (terminal) await this.notify(terminal);
            res.status(204).json(removedElements.POJO());
        })

}
