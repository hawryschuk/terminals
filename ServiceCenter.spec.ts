// import { ServiceCenter } from "./ServiceCenter"

import { Util } from "@hawryschuk-common";
import { Terminal } from "./Terminal";
import { expect } from "chai";
import { Mutex } from "@hawryschuk-locking/Mutex";
import { ServiceCenter, BaseService, Messaging } from "./ServiceCenter";

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

export class ServiceCenterClient {
    constructor(public terminal: Terminal) { }

    get LoungeMessages(): Array<Messaging.LoungeMessage> {
        return this.terminal.history.filter(m => m.message?.type === 'loungeMessage').map(m => m.message) as any;
    }

    get Tables(): Messaging.Tables['tables'] | undefined {
        return this.terminal.history.filter(m => m.message?.type === 'tables').pop()?.message.tables as any;
    }

    get ServiceStarted() {
        const started = this.terminal.history.filter(m => m.message?.type == 'start-service').pop();
        const ended = this.terminal.history.filter(m => m.message?.type == 'end-service').pop();
        return !!started && (!ended || this.terminal.history.indexOf(ended) < this.terminal.history.indexOf(started));
    }

    get ServiceEnded(): Messaging.ServiceResult['results'] | undefined {
        const started = this.terminal.history.filter(m => m.message?.type == 'start-service').pop();
        const ended = this.terminal.history.filter(m => m.message?.type == 'end-service').pop();
        return !!ended && this.terminal.history.indexOf(ended) > this.terminal.history.indexOf(started!)
            ? ended.message.results
            : undefined;
    }
}

describe('Service Center', () => {
    const serviceCenter = new ServiceCenter;
    const terminal = new Terminal;
    const terminal2 = new Terminal;
    const terminal3 = new Terminal;
    const client = new ServiceCenterClient(terminal);

    after(() => serviceCenter.finish());

    it('Allows registering services', () => {
        serviceCenter.register(TestingServices.BrowniePoints);
        serviceCenter.register(TestingServices.GuessingGame);
    });

    it('Displays registered services', () => {
        expect(serviceCenter.registry).to.be.ok;
    });

    it('Allows users to join', async () => {
        await serviceCenter.join(terminal);
    });

    it('Prompts users for their name', async () => {
        await terminal.answer({ name: 'alex' });
    });

    it('Knows the name of every terminal', async () => {
        await Util.waitUntil(() => terminal.input.Name === 'alex');
    });

    it('Prevents two users from having the same name', async () => {
        const terminal = terminal2;
        await serviceCenter.join(terminal);
        await terminal.answer({ name: 'alex' });
        await Util.waitUntil(() => terminal.history.some(i => i.message?.type === 'name-in-use'));
        await Util.waitUntil(() => terminal.prompts.name);
    });

    it('allows users to send messages to the lobby', async () => {
        expect(terminal.prompts.loungeMessage).to.be.ok;
        await terminal.answer({ loungeMessage: 'hello' });
        await Util.waitUntil(() => {
            return [terminal, terminal2]
                .every(t => Util.findWhere(
                    new ServiceCenterClient(t).LoungeMessages,
                    { from: 'alex', message: 'hello' }
                ));
        });
    });

    it('Provides a list of services', async () => {
        await Util.waitUntil(() => terminal.prompts.service);
    });

    it('Lets the user select a service', async () => {
        const [{ choices }] = terminal.prompts.service;
        const { value: service } = Util.findWhere(choices!, { title: TestingServices.BrowniePoints.NAME })!;
        await terminal.answer({ service });
        expect(terminal.input.service).to.be.ok;
    });

    it('Lets the user list tables', async () => {
        expect(client.Tables).to.not.be.ok;
        const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
        expect(prompt.choices);
        const choice = Util.findWhere(prompt.choices!, { title: 'List Tables' })!;
        const index = prompt.choices?.indexOf(choice);
        await terminal.answer({ menu: index });
        await Util.waitUntil(() => client.Tables?.length === 0);
    });

    it('Lets the user create a table', async () => {
        const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
        const create = Util.findWhere(prompt.choices!, { title: 'Create Table' })!;
        await terminal.answer({ menu: prompt.choices?.indexOf(create) });
        await Util.waitUntil(() => terminal.input.table);
    });

    it('Lets the user leave a table', async () => {
        const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
        const choice = Util.findWhere(prompt.choices!, { title: 'Leave Table' })!;
        await terminal.answer({ menu: choice.value });
        await Util.waitUntil(() => !terminal.input.table);
    });

    it('Lets the user join a table', async () => {
        const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
        const choice = Util.findWhere(prompt.choices!, { title: 'Join Table' })!;
        await terminal.answer({ menu: choice.value });

        const [{ choices }] = await Util.waitUntil(() => terminal.prompts.table);
        await terminal.answer({ table: choices![0].value });
        await Util.waitUntil(() => terminal.input.table);
    });

    it('Lets the user sit', async () => {
        (globalThis as any).terminal = terminal;
        const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
        const choice = Util.findWhere(prompt.choices!, { title: 'Sit' })!;
        await terminal.answer({ menu: choice.value });
        await Util.waitUntil(() => terminal.input.seat);
    });

    it('Lets the user signal they are ready', async () => {
        const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
        const choice = Util.findWhere(prompt.choices!, { title: 'Ready' })!;
        await terminal.answer({ menu: choice.value });
        await Util.waitUntil(() => terminal.input.ready);
    });

    it('Is notified when the service begins - and what the results were : Brownie Points -- Zero Interaction', async () => {
        const results = await Util.waitUntil(() => client.ServiceEnded);
        expect(results!.winners.includes(terminal.id));
    });

    it('When a service has multiple choices for the number of seats, the user is prompted to select', async () => {
        // A) create two terminals , B) join the service center, C) provide their names , D) choose the guessing game service
        await terminal2.answer({ name: 'player2' });
        await serviceCenter.join(terminal3);
        await terminal3.answer({ name: 'player3' });

        // Choose the service: guessing game 
        const [{ choices }] = await Util.waitUntil(() => terminal2.prompts.service);
        const { value: service } = Util.findWhere(choices!, { title: TestingServices.GuessingGame.NAME })!;
        await terminal2.answer({ service });
        await terminal3.answer({ service });

        // create a table with two seats (Terminal2)
        {
            const [prompt] = await Util.waitUntil(() => terminal2.prompts.menu);
            const create = Util.findWhere(prompt.choices!, { title: 'Create Table' })!;
            await terminal2.answer({ menu: prompt.choices?.indexOf(create) });
            await terminal2.answer({ seats: 2 });
        }
    });

    it('Lets the Service operate the terminals AFTER every Seat at the Table is ready and the Service started', async () => {
        // Join the table (Terminal3)
        {
            const [prompt] = await Util.waitUntil(() => terminal3.prompts.menu);
            const choice = Util.findWhere(prompt.choices!, { title: 'Join Table' })!;
            await terminal3.answer({ menu: choice.value });

            const [{ choices }] = await Util.waitUntil(() => terminal3.prompts.table);
            await terminal3.answer({ table: choices![0].value });
            await Util.waitUntil(() => terminal3.input.table);
        }

        // take a seat
        for (const terminal of [terminal2, terminal3]) {
            const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
            const choice = Util.findWhere(prompt.choices!, { title: 'Sit' })!;
            await terminal.answer({ menu: choice.value });
            await Util.waitUntil(() => terminal.input.seat);
        }

        // become ready
        for (const terminal of [terminal2, terminal3]) {
            const [prompt] = await Util.waitUntil(() => terminal.prompts.menu);
            const choice = Util.findWhere(prompt.choices!, { title: 'Ready' })!;
            await terminal.answer({ menu: choice.value });
        }

        // wait for game to start
        const client = new ServiceCenterClient(terminal2);
        await Util.waitUntil(() => client.ServiceStarted);

        // play the game
        await terminal2.answer({ guess: 4 });
        await terminal3.answer({ guess: 5 });

        // expect the game to end
        const results = await Util.waitUntil(() => client.ServiceEnded!);

        // theres 1 winner, 1 loser , they are different , and they are one of the two 
        expect(results.winners.length == 1 && results.losers.length == 1).to.be.ok;
        expect(results.winners[0] !== results.losers[0]).to.be.ok;
        expect([terminal2.id, terminal3.id].includes(results.winners[0]));
        expect([terminal2.id, terminal3.id].includes(results.losers[0]));
    });

});
