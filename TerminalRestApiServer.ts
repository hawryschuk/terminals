import express, { Router } from 'express';
import 'express-async-errors';
import { Terminal } from './Terminal';
import { MemoryStorage, ORM } from '@hawryschuk-crypto';
import { Mutex } from '@hawryschuk-locking/Mutex';
import { ServiceCenter } from './ServiceCenter';
import { IStorage } from '@hawryschuk-crypto/IStorage';

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
    static models = { Terminal };    // The data models used by this server that are persisted online 

    static async clearTerminals(storage: IStorage) {
        for await (const key of storage.keys('Terminal/'))
            console.log('removing key', key), await storage.removeItem(key);
    }

    constructor(
        public storage: IStorage = new MemoryStorage,
        public serviceCenter = new ServiceCenter,
    ) { }

    dao: ORM = new ORM().Register(this.storage, TerminalRestApiServer.models);

    private atomic(block: any) { return this.mutex.use({ block }); }; private mutex = new Mutex;

    async finish() {
        this.serviceCenter.finish();
        for await (const key of this.storage.keys('Terminal/')) {
            const [, id] = key.split('/');
            const terminal = await this.dao.retrieve(Terminal, id, true);
            if (terminal) {
                await terminal.finish();
            }
        }
    }

    router = Router()
        /** Connect the service  */
        .get('/service', async (req, res) => {
            await this.atomic(async () => {
                const { id } = req.query as any;
                const terminal = await this.dao.retrieve(Terminal, id, true);
                if (!this.serviceCenter)
                    res.send(500).json({ error: 'no-service-center' })
                else if (terminal) {
                    await this.serviceCenter!
                        .join(terminal)
                        .then(() => res.json({ success: true }))
                        .catch(e => res.status(500).json({ error: e.message }));
                }
                else
                    res.status(404).end();
            });
        })

        /** 1) Create a new terminal : As an externally running application, I want to interface with users online, and will create Terminals to do so */
        .get('/terminal', async (req, res) => {
            await this.atomic(async () => {
                const { owner } = req.query;
                const terminal = await this.dao.save(new Terminal({ owner }));
                res.status(200).json(terminal);
            });
        })

        .get('/terminal/:terminal_id', async (req, res) => {
            await this.atomic(async () => {
                const { terminal_id } = req.params;
                const terminal = await this.dao.retrieve(Terminal, terminal_id, true);
                if (terminal) {
                    const { finished } = terminal;
                    if (finished)
                        res.status(410).json({ finished });
                    else
                        res.status(terminal ? 200 : 404).json(terminal);
                } else
                    res.status(404).end();
            });
        })

        /** 3.2) [OPTIONAL] promptee reads subsequent terminal history after a certain ?start point */
        .get('/terminal/:terminal_id/history', async (req, res) => {
            await this.atomic(async () => {
                const { start = '0' } = req.query as any;
                const { terminal_id } = req.params;
                const terminal = await this.dao.retrieve(Terminal, terminal_id, true);
                if (terminal) {
                    const { finished } = terminal;
                    if (finished)
                        res.status(410).json({ finished });
                    else
                        res.status(200).json(terminal.history.slice(parseInt(start)));
                } else
                    res.status(404).end();
            });
        })

        /** Terminal Creator overwrites the history (usually in initialization) */
        .put('/terminal/:terminal_id/history', async (req, res) => {
            await this.atomic(async () => {
                const { terminal_id } = req.params;
                const terminal = await this.dao.retrieve(Terminal, terminal_id, true);
                if (terminal && !terminal.finished) Object.assign(terminal, { history: req.body }).save();
                res.status(terminal ? terminal.finished ? 410 : 200 : 404).end();
            })
        })

        /** Promptee responds to a prompt */
        .post('/terminal/:terminal_id/response', async (req, res) => {
            await this.atomic(async () => {
                const { terminal_id } = req.params;
                const terminal = await this.dao.retrieve(Terminal, terminal_id, true);
                const { index, value } = req.body;
                const prompt = terminal?.history[index]?.prompt;
                if (terminal?.finished)
                    res.status(410).end();
                else if (prompt) {
                    if ('resolved' in prompt)
                        res.status(400).end();
                    else {
                        await terminal.respond(value, prompt.name, index);
                        res.status(200).end();
                    }
                } else {
                    res.status(404).end();
                }
            })
        })

        /** Push a new item to an existing terminal : prompt, stdout */
        .put('/terminal/:terminal_id', async (req, res) => {
            await this.atomic(async () => {
                const { terminal_id } = req.params;
                const terminal = await this.dao.retrieve(Terminal, terminal_id, true);
                if (terminal?.finished)
                    res.status(410).json({ finished: terminal.finished });
                else if (terminal) {
                    await terminal.put(req.body);
                    await terminal.save();
                    res.status(200).json({ index: terminal.history.length - 1 });
                } else {
                    res.status(404).end();
                }
            })
        })

        /** Finish using a terminal */
        .delete('/terminal/:terminal_id', async (req, res) => {
            await this.atomic(async () => {
                const { terminal_id } = req.params;
                const terminal = await this.dao.retrieve(Terminal, terminal_id, true);
                const success = await terminal?.finish();
                setTimeout(() => terminal?.delete(), 5 * 60_000); // delete in 5 minutes
                const data = { finished: terminal?.finished, success };
                res
                    .status(terminal ? 200 : 404)
                    .json(data)
                    .end();
            })
        })


    /** Terminal Services : Node-Express REST API App : Deployable to Serverless AWS/Azure/GCP, localhost, and on-prem/co-loc */
    expressApp = express()
        .use(require('cors')({ origin: true }))
        .use(require('body-parser').json())
        .use(async (req, res, next) => { res.append('x-terminal-services', '1.0.0'); next(); })
        .use(this.router)
}
