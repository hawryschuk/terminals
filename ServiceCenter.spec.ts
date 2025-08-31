import { Util } from "@hawryschuk-common/util";
import { Terminal } from "./Terminal";
import { expect } from "chai";
import { ServiceCenter } from "./ServiceCenter";
import { WebTerminal } from "WebTerminal";
import { server } from "./WebTerminal.spec";
import { ServiceCenterClient } from "./ServiceCenterClient";
import { TestingServices } from "./TestingServices";

/** Test the service center : 1) Locally, 2) Remote (Terminal Services) */
for (const type of ['local', 'remote'])
    describe(`Service Center ( Client & Server ): ${type}`, () => {
        let serviceCenter: ServiceCenter,
            client: ServiceCenterClient,
            client2: ServiceCenterClient,
            client3: ServiceCenterClient,
            terminal: Terminal,
            terminal2: Terminal,
            terminal3: Terminal;
        before(async () => {
            const httpClient = type == 'remote' ? WebTerminal.httpClient : undefined;
            server.serviceCenter.finish();
            serviceCenter = server.serviceCenter = new ServiceCenter().register(TestingServices.BrowniePoints, TestingServices.GuessingGame);
            client = await ServiceCenterClient.create({ httpClient });
            client2 = await ServiceCenterClient.create({ httpClient });
            client3 = await ServiceCenterClient.create({ httpClient });
            terminal = client.terminal;
            terminal2 = client2.terminal;
            terminal3 = client3.terminal;
            Object.assign(globalThis, { client, Util });
        });

        after(() => {
            serviceCenter.finish();
            [terminal, terminal2, terminal3].forEach(t => t.finish());
        });

        it('Allows registering services', () => {

        });

        it('Displays registered services', () => {
            expect(serviceCenter.registry).to.be.ok;
        });

        it('Allows users to join', async () => {
            if (type === 'local') { // 'remote' serviceCenters will be joined automatically on the server-side
                await serviceCenter.join(terminal);
                await serviceCenter.join(terminal2);
                await serviceCenter.join(terminal3);
            }
        });

        it('Prompts users for their name', async () => {
            await terminal.answer({ name: `alex ${type}` });
        });

        it('Knows the name of every terminal', async () => {
            await Util.waitUntil(() => terminal.input.Name === `alex ${type}`);
        });

        it('Prevents two users from having the same name', async () => {
            await client2.Name(`alex ${type}`);
            await Util.waitUntil(() => client2.NameInUse);
        });

        it('Provides a list of services', async () => {
            await Util.waitUntil(() => client.Services);
        });

        it('Lets the user select a service', async () => {
            await client.SetService(TestingServices.GuessingGame.NAME);
        });

        it('Lets the user list tables', async () => {
            expect(client.Tables!.length).to.equal(0);
        });

        it('Lets the user create a table', async () => {
            const { table } = await client.CreateTable(1); // TODO: expect to prompt for seats when seats is unprovided
            expect(table).to.be.ok;
            await Util.waitUntil(() => client.Tables!.length === 1);
            await Util.waitUntil(() => client.Table);
        });

        it('Lets the user leave a table', async () => {
            await client.LeaveTable();
        });

        it('Lets the user join a table', async () => {
            await client.JoinTable(client.Tables![0].id);
        });

        it('Lets the user sit', async () => {
            await client.Sit();
        });

        it('Lets the user signal they are ready', async () => {
            await client.Ready();
        });

        it('Indicates the service has started when all the users have indicated they are ready', async () => {
            await Util.waitUntil(() => client.Service?.Instance);
            await Util.waitUntil(() => client.Service?.Running);
        });

        it('Lets the Service begin to operate the terminals ( when the service is running )', async () => {
            await client.terminal.answer({ guess: 4 });
        });

        it('Indicates when the service has finished -- and what the results were', async () => {
            const results = await Util.waitUntil(() => client.Service?.Results);
            expect(results!.winners.includes(terminal.id));
        });

        it('When a service has multiple choices for the number of seats, the user is prompted to select', async () => {
            await client2.Name(`player2 (${type})`);
            await client3.Name(`player3 (${type})`);
            await client2.SetService(TestingServices.GuessingGame.NAME);
            await client3.SetService(TestingServices.GuessingGame.NAME);
            const { table } = await client2.CreateTable(2);
            expect(table).to.be.ok;
        });

        it('Lets the Service operate the terminals AFTER every Seat at the Table is ready and the Service started', async () => {
            await client3.JoinTable(client2.terminal.input.table);

            for (const client of [client2, client3]) {
                await client.Sit();
                await client.Ready();
            }

            await Util.waitUntil(() => client2.Service?.Running);
            await Util.waitUntil(() => client2.Service?.Instance);

            // play the game
            await terminal2.answer({ guess: 4 });
            await terminal3.answer({ guess: 5 });

            // expect the game to end
            const results = await client2.Results;

            // theres 1 winner and 1 loser (being different)
            expect(results.winners.length == 1 && results.losers.length == 1).to.be.ok;
            expect(results.winners[0] !== results.losers[0]).to.be.ok;
            expect([terminal2.id, terminal3.id].includes(results.winners[0]));
            expect([terminal2.id, terminal3.id].includes(results.losers[0]));
        });

        it('After the game finishes, the user is unready and needs to renew their readiness to start the service again', async () => {
            await Util.waitUntil(() => !client.terminal.input.ready);
        });

        it('allows users to send messages to the service lounge', async () => {
            await client2.SelectMenu('Message Lounge');
            await client2.terminal.answer({ message: 'hello' });
            await Util.waitUntil(() => [client2, client3].every(client => Util.findWhere(client.Messages.Lounge, { message: 'hello' })));
        });

        it('expects no errors ', () => {
            expect([client, client2, client3].every(c => !c.terminal.history.some(i => i.message?.type === 'error')));
        })
    });