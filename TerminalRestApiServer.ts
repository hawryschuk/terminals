import express from 'express';
import { Util } from '@hawryschuk/common';
import { DAO, Model } from '@hawryschuk/dao';
import { WebTerminal } from './WebTerminal';
import { Terminal } from './Terminal';
import Mutex from '@hawryschuk/resource-locking/mutex';
import Semaphore from '@hawryschuk/resource-locking/semaphore';
import AtomicData from '@hawryschuk/resource-locking/atomic.data';
import { readFileSync, writeFileSync } from 'fs';
import { TerminalRestApiClient } from './TerminalRestApiClient';
// export const atomic = (resource: string, block: any) => Mutex.getInstance({ TableName: 'test', resource }).use({ block });

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
export class TerminalRestApiServer {
    static models = { Terminal, WebTerminal };    // The data models used by this server that are persisted online 
    static semaphore
    constructor(
        private dao = new DAO(TerminalRestApiServer.models),
        private atomic = (resource: string, block: any) => Semaphore.getInstance({ data: AtomicData.getInstance({ resource }) }).use({ block })
    ) {
        // DAO.cacheExpiry = 0;
    }

    /**
     * Hawryschuk.com::Table-Service
     *  /stock.ticker
     *  /hearts
     *  /spades
     *      -- join an existing room
     *      -- create a new room
     *          -- watch
     *          -- sit
     *          -- boot
     *          -- stand
     *      -- once everyone is ready - start game
     */

    /** Returns the non-expired terminals */
    get terminals(): Promise<WebTerminal[]> {
        return this
            .dao.get<WebTerminal[]>(WebTerminal)
            .then(Object.values)
            .then(terminals => terminals
                .filter(terminal => {
                    if (terminal.expired) this.dao.delete(WebTerminal, terminal.id).catch(async e => null)
                    return !terminal.expired;
                }));
    }

    /** Terminal Services : Node-Express REST API App : Deployable to Serverless AWS/Azure/GCP, localhost, and on-prem/co-loc */
    expressApp = express()
        .use(require('cors')({ origin: true }))
        .use(require('body-parser').json())
        .use(async (req, res, next) => {
            res.append('x-terminal-rest-api-version', '1.0.0');
            next();
        })

        .use('/', express.static('frontend'))

        /** 1A) know [all] terminals */
        .get('/terminals', async (req, res) => {         // { id, description, instances:[{id,started,finished,terminals:[{id,owner,started,finished,history}...]}...] }[]
            res.status(200).json(await this.terminals.then(t => t.map(t => t.POJO())));
        })

        /** 1B) know just the terminal you will use */
        .get('/services/:service_id/terminal', async (req, res) => {
            const owner = Util.safely(() => JSON.parse(req.query.owner as string));
            if (owner && !Util.equalsDeep({}, owner)) {
                const terminal = await this.atomic('free-terminal', async () => {
                    const terminal: WebTerminal = await Util.waitUntil(async () => (await this.terminals).find(t => t.available));
                    await terminal.claim(owner);
                    return terminal;
                });
                res.status(200).json(terminal.POJO());
            } else {
                res.status(400).json({ error: 'invalid-owner' })
            }
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

        /** 2) Claim terminal ownership */
        .put('/services/:service_id/:instance_id/terminals/:terminal_id/owner', async (req, res) => {
            const { terminal_id } = req.params;
            const { owner } = req.body;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                if (terminal) {
                    await terminal.update$({ owner });
                    res.status(200).json(terminal.POJO());
                } else {
                    res.status(403).end();
                }
            });
        })

        .get('/services/:service_id/:instance_id/terminals/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal = await this.dao.get<WebTerminal>(WebTerminal, terminal_id);
                if (terminal) await terminal.keepAlive();
                res.status(terminal ? 200 : 404).json(terminal && terminal.POJO());
            });
        })

        /** 3.2) [OPTIONAL] promptee reads subsequent terminal history after a certain ?start point */
        .get('/services/:service_id/:instance_id/terminals/:terminal_id/history', async (req, res) => {
            const { start = '0' } = req.query as any;
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal = await this.dao.get<WebTerminal>(WebTerminal, terminal_id);
                if (terminal) {
                    await terminal.keepAlive();
                    const { history = [] } = terminal || {};
                    res.status(200).json(history.slice(parseInt(start)));
                } else
                    res.status(404).end();
            });
        })

        /** WebTerminal Creator overwrites the history (usually in initialization) */
        .put('/services/:service_id/:instance_id/terminals/:terminal_id/history', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                const history = req.body;
                await this.dao.update(WebTerminal, terminal_id, { history });
                res.status(200).json(terminal.POJO());
            });
        })

        /** 5) promptee terminates-connection/relenquishes-ownership */
        .delete('/services/:service_id/:instance_id/terminals/:terminal_id/owner', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                if (terminal) await terminal.update$({ owner: undefined });
                res.status(200).json(terminal.POJO());
            });
        })

        .get('/save', async () => { writeFileSync('save.json', JSON.stringify(Object.values(await this.dao.get(WebTerminal)).map((t: any) => t.POJO()))); })
        .get('/load', async () => { JSON.parse(readFileSync('save.json').toString()).forEach(t => this.dao.create(WebTerminal, t)) })

        /** Promptee responds to a prompt */
        .post('/services/:service_id/:instance_id/terminals/:terminal_id/response', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                const { index, name, response: value } = req.body;
                if (terminal) {
                    const temp = TerminalRestApiClient.httpClient;
                    TerminalRestApiClient.httpClient = null;
                    const { error, success } = <any>await terminal.respond(value, name, index).then(success => ({ success })).catch(error => ({ error }));
                    TerminalRestApiClient.httpClient = temp;
                    res.status(error ? 500 : 200).json(error ? { error: error.message } : success);
                } else {
                    res.status(404).json({ error: 'non-existent' });
                }
            }).catch(e => {
                console.error(e.message);
            });
        })

        /** Put to an existing terminal : prompt, stdout */
        .put('/services/:service_id/:instance_id/terminals/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::WebTerminal::${terminal_id}`, async () => {
                const terminal: WebTerminal = await this.dao.get(WebTerminal, terminal_id);
                if (terminal) {
                    await terminal.update$({ history: [...terminal.history, req.body] });
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
            res.status(204).json(Util.safely(() => (removedElements as any).POJO()));
        })

}
