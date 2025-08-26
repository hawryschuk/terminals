import { Util } from "@hawryschuk-common";
import { Terminal } from "./Terminal";
import { expect } from "chai";
import { ServiceCenter, BaseService } from "./ServiceCenter";
import { WebTerminal } from "WebTerminal";
import { server } from "./WebTerminal.spec";
import { ServiceCenterClient } from "ServiceCenterClient";

/** For testing only */
namespace TestingServices {
    export class BrowniePoints extends BaseService {
        static NAME = 'Brownie Points';
        static USERS = 1;

        async start() { return { winners: this.seats.map(s => s.terminal!.id), losers: [] } }
    }
    export class GuessingGame extends BaseService {
        static NAME = 'Guessing Game';
        static USERS = [1, 2];
        async start() {
            const min = 1, max = 10;
            const random = Util.random({ min, max });
            await this.broadcast(`A random number has been chosen. Prompting each player to guess what it is.`)
            await Promise.all(this.seats.map(seat => seat.terminal!.prompt({ name: 'guess', message: `Guess a number between ${min} and ${max}`, min, max, type: 'number' })));
            const mapped = this
                .seats
                .map(seat => ({ seat, distance: Math.abs(random - seat.terminal!.input.guess) }))
                .sort((a, b) => a.distance - b.distance);
            const winners = mapped.filter(item => item.distance === mapped[0].distance).map(item => item.seat.terminal!);
            const losers = this.seats.map(seat => seat.terminal!).filter(terminal => !winners.includes(terminal));
            await this.broadcast(`Every player has made their guess. The random number was ${random}. The winners are: ${winners.map(w => w.input.name).join(', ')}`);
            return { winners: Util.pluck(winners, 'id'), losers: Util.pluck(losers, 'id') };
        }
    }
}

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
            serviceCenter = server.serviceCenter = new ServiceCenter;
            client = await ServiceCenterClient.create({ httpClient });
            client2 = await ServiceCenterClient.create({ httpClient });
            client3 = await ServiceCenterClient.create({ httpClient });
            terminal = client.terminal;
            terminal2 = client2.terminal;
            terminal3 = client3.terminal;
        });

        after(() => {
            serviceCenter.finish();
            [terminal, terminal2, terminal3].forEach(t => t.finish());
        });

        it('Allows registering services', () => {
            serviceCenter.register(TestingServices.BrowniePoints);
            serviceCenter.register(TestingServices.GuessingGame);
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

        it('allows users to send messages to the lobby', async () => {
            expect(terminal.prompts.loungeMessage).to.be.ok;
            await terminal.answer({ loungeMessage: 'hello' });
            await Util.waitUntil(() => [client, client2].every(
                client => Util.findWhere(
                    client.LoungeMessages,
                    { from: `alex ${type}`, message: 'hello' }
                )
            ));
        });

        it('Provides a list of services', async () => {
            await Util.waitUntil(() => client.Services);
        });

        it('Lets the user select a service', async () => {
            await client.SetService(TestingServices.BrowniePoints.NAME);
        });

        it('Lets the user list tables', async () => {
            expect(client.Tables).to.not.be.ok;
            await client.ListTables();
            expect(client.Tables!.length).to.equal(0);
        });

        it('Lets the user create a table', async () => {
            expect(await client.CreateTable()).to.be.ok;
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

        it('Is notified when the service begins - and what the results were : Brownie Points -- Zero Interaction', async () => {
            const results = await Util.waitUntil(() => client.ServiceEnded);
            expect(results!.winners.includes(terminal.id));
        });

        it('When a service has multiple choices for the number of seats, the user is prompted to select', async () => {
            await client2.Name(`player2 (${type})`);
            await client3.Name(`player3 (${type})`);
            await client2.SetService(TestingServices.GuessingGame.NAME);
            await client3.SetService(TestingServices.GuessingGame.NAME);
            await client2.CreateTable(2);
        });

        it('Lets the Service operate the terminals AFTER every Seat at the Table is ready and the Service started', async () => {
            await client3.JoinTable(client2.terminal.input.table);

            for (const client of [client2, client3]) {
                await client.Sit();
                await client.Ready();
            }

            await Util.waitUntil(() => client2.ServiceStarted);

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

    });