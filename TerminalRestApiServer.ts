import express from 'express';
import { Terminal, TerminalActivity } from './Terminal';
import { User } from './User';
import { MemoryStorage, ORM, StorageCache } from '@hawryschuk-crypto';
import { Mutex } from '@hawryschuk-locking/Mutex';
import { ServiceCenter } from './ServiceCenter';

// export const atomic = (resource: string, block: any) => Mutex.getInstance({ TableName: 'test', resource }).use({ block });

/** The "Terminal Services Rest API Server" is a REST-API Server Application, using Node-Express,
 * that allows for applications interacting with one or more users online through Terminal objects.
 * 
 * The Terminal object is a client of this server, keeping the Terminal persisted online through
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
 * 10) Send Push-Notifications to WebSockets observing Terminals that are changed 
 * 11) Delete a terminal
 * 12) Auto-delete terminals that expire
 * 
 * Features via Technical-Debt
 * 1) Atomic operations on the persisted-data ( to prevent bugs from write-clobbers )
 * */
export class TerminalRestApiServer {
    static models = { Terminal, User };    // The data models used by this server that are persisted online 

    constructor(
        // public dao = new ORM().Register(new StorageCache(new MemoryStorage), TerminalRestApiServer.models),
        // public dao = new ORM().Register(new StorageCache(new MemoryStorage), TerminalRestApiServer.models),
        public dao = new class {
            data: any = {};
            retrieve(k: any, id: string) { return this.data[id] }
            save(o: Terminal) { return this.data[o.id] = o }
        },
        public serviceCenter = new ServiceCenter,
    ) { }

    private atomic(resource: string, block: any) { return Mutex.getInstance(resource).use({ block }); }

    /** Terminal Services : Node-Express REST API App : Deployable to Serverless AWS/Azure/GCP, localhost, and on-prem/co-loc */
    expressApp = express()
        .use(require('cors')({ origin: true }))
        .use(require('body-parser').json())
        .use(async (req, res, next) => {
            res.append('x-terminal-rest-api-version', '1.0.0');
            next();
        })

        /** Connect the service  */
        .get('/service', async (req, res) => {
            const { id } = req.body;
            const terminal = await this.dao.retrieve(Terminal, id);
            if (!this.serviceCenter)
                res.send(500).json({ error: 'no-service-center' })
            else if (terminal)
                await this.serviceCenter!
                    .join(terminal)
                    .then(() => res.json({ success: true }))
                    .catch(e => res.status(500).json({ error: e.message }));
            else
                res.status(404);
        })

        /** 1) Create a new terminal : As an externally running application, I want to interface with users online, and will create Terminals to do so */
        .get('/terminal', async (req, res) => {
            const { owner } = req.body;
            const terminal = await this.dao.save(new Terminal({ owner }));
            res.status(200).json(terminal);
        })

        .get('/terminal/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::Terminal::${terminal_id}`, async () => {
                const terminal = await this.dao.retrieve(Terminal, terminal_id);
                res.status(terminal ? 200 : 404).json(terminal);
            });
        })

        /** 3.2) [OPTIONAL] promptee reads subsequent terminal history after a certain ?start point */
        .get('/terminal/:terminal_id/history', async (req, res) => {
            const { start = '0' } = req.query as any;
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::Terminal::${terminal_id}`, async () => {
                const terminal = await this.dao.retrieve(Terminal, terminal_id);
                if (terminal) {
                    res.status(200).json(terminal.history.slice(parseInt(start)));
                } else
                    res.status(404).end();
            });
        })

        /** Terminal Creator overwrites the history (usually in initialization) */
        .put('/terminal/:terminal_id/history', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::Terminal::${terminal_id}`, async () => {
                const terminal: Terminal = await this.dao.retrieve(Terminal, terminal_id);
                if (terminal) await this.dao.save(Object.assign(terminal, { history: req.body }));
                res.status(terminal ? 200 : 404).json(terminal);
            });
        })

        /** Promptee responds to a prompt */
        .post('/terminal/:terminal_id/response', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::Terminal::${terminal_id}`, async () => {
                const terminal: Terminal = await this.dao.retrieve(Terminal, terminal_id);
                const { index, name, value } = req.body;
                if (terminal) {
                    const { error, success } = <any>await terminal.respond(value, name, index).then(success => ({ success })).catch(error => ({ error }));
                    res.status(error ? 500 : 200).json(error ? { error: error.message } : success);
                } else {
                    res.status(404).end();
                }
            }).catch(e => {
                console.error(e.message);
            });
        })

        /** Put to an existing terminal : prompt, stdout */
        .put('/terminal/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            await this.atomic(`TerminalServer::Terminal::${terminal_id}`, async () => {
                const terminal: Terminal = await this.dao.retrieve(Terminal, terminal_id);
                if (terminal) {
                    terminal.put(req.body as any);
                    await terminal.save();
                    res.status(200).json({ index: terminal.history.length - 1 });
                } else {
                    res.status(404).json({ error: 'non-existent-terminal' });
                }
            });
        })

        /** Finish using a terminal */
        .delete('/terminal/:terminal_id', async (req, res) => {
            const { terminal_id } = req.params;
            const terminal: Terminal = await this.dao.retrieve(Terminal, terminal_id);
            terminal?.finish();
            // await terminal?.delete();
            res.status(!terminal ? 404 : 204).end();
        })

}
