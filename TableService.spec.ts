import { expect } from 'chai';
import { Util } from '@hawryschuk/common';
import { DAO } from '@hawryschuk/dao';
import { WebTerminal } from './WebTerminal';
import { TableService } from './TableService';
import { Game } from '../Spades/business/Game';
import { Game as StickTickerGame } from '../stock.ticker/business/Game';
import { filter, take } from 'rxjs/operators';
import { freeTerminal, terminal } from './TableServiceHost.spec';

DAO.cacheExpiry = Infinity;
let tableService: TableService;

describe('Table Services: Stock-Ticker', async () => {
    before(async () => {
        tableService = new TableService(terminal);
        await terminal.answer({
            name: 'alex',
            service: 'stock ticker',
            action: [
                'join-table',
                'sit',
                'invite-robot',
                'invite-robot',
                'invite-robot',
                'ready'
            ],
            table: 1,
            seat: 1,
            robot: [2, 3, 4]
        });
    });

    it('Lets you roll or buy/sell', async () => {
        // console.log('hmm --- ');
        // terminal.updated$.subscribe(() => console.log(JSON.stringify(terminal.history, null, 2)));
        await Util.waitUntil(() => terminal.prompts['stock-ticker-action']);
        await terminal.answer({ 'stock-ticker-action': ['buy-bonds', 'buy-gold', 'roll-dice'], units: [500, 1500] })
    });

    it('lets the robot player autoplay', async () => {
        await Util.waitUntil(() => terminal.prompts['stock-ticker-action']);
        await Util.waitUntil(() => terminal.history.find(i => /Robot 2 rolled/.test(i.message)))
    });

    it('will finish the game after X number of moves', async () => {
        StickTickerGame.FINISHED_WHEN_HISTORY = 6;
        await Util.waitUntil(async () => {
            if (terminal.prompts['stock-ticker-action'])
                await terminal.answer({ 'stock-ticker-action': 'roll-dice' });
            return terminal.prompts.ack_game;
        });

        await terminal.answer({ ack_game: '' });

        await Util.waitUntil(async () => !tableService.ready && tableService.results);
    });
});

describe('Table Service', async () => {
    let terminal: WebTerminal = await freeTerminal();
    tableService = new TableService(terminal);

    it('Registers your name', async () => {
        await terminal.answer({ name: 'alex' });
        expect(terminal.input.name).to.equal('alex')
    });

    it('Records the software-service [id] you want to consume', async () => {
        console.log('waiting until questioned for service...');
        await Util.waitUntil(() => terminal.prompts.service);
        console.log('/waiting until questioned for service...');
        await terminal.answer({ service: 'spades' });
    });

    it('As a SaaS host, we will consistently maintain a minimum of one table per service that is empty', async () => {
        await terminal.updated$.pipe(filter(() => tableService.tables?.length), take(1)).toPromise();
        await Util.waitUntil(async () => { return tableService.tables?.length; })
    });

    it('Allows you to join a table for the purpose of running a multi-user service (ie 4 player card game)', async () => {
        await terminal.answer({ action: 'join-table', table: 1 });
    });

    it('Allows you to sit at a seat in the table (as opposed to observing)', async () => {
        await terminal.answer({ action: 'sit', seat: 1 });
    });

    it('Allows you to be ready to start the service', async () => {
        await terminal.answer({ action: 'ready' });
    });

    it('Allows you to invite robots into the vacant seats', async () => {
        await terminal.answer({ action: 'invite-robot', robot: 2 });
        await terminal.answer({ action: 'invite-robot', robot: 3 });
        await terminal.answer({ action: 'invite-robot', robot: 4 });
    });

    it('Allows you to boot robots')

    it('Disallows you from booting robots while the service is running')

    it('expects the service to begin when the table is ready (all occupants excluding robots are ready)', async () => {
        await Util.waitUntil(() => { return terminal.history.find(h => h.message === 'serviceInstance has started'); });
        await Util.waitUntil(() => terminal.history.find(h => h.type === 'prompt' && !('resolved' in h.options) && h.options.name === 'bid'));
    });

    it('allows the user to stand up during the game', async () => {
        await terminal.answer({ action: 'stand' });
        await Util.waitUntil(async () => { return !tableService.tables[0].ready; })
    });

    it('allows the user to sit back down and start the game', async () => {
        await terminal.answer({ action: 'sit', seat: 1 });
        await terminal.answer({ action: 'ready' });
        expect(await Util.waitUntil(async () => { return (await tableService.tables)[0].ready; })).to.be.ok;
        await Util.waitUntil(() => { return terminal.history.filter(h => h.message === 'serviceInstance has started').length === 2; });
    });

    it('allows the user to bid and play cards', async () => {
        await terminal.answer({ bid: 3 });
        const { initial, choices } = await Util.waitUntil(async () => (terminal.prompts.card || [])[0]);
        await terminal.answer({ card: initial || choices.find(c => !c.disabled).value });
    });

    const terminals: WebTerminal[] = [];
    it('allows for multiple (4) people (WebTerminal connections) to run a new service instance together (card game extends baseservice) ', async () => {
        for (let i = 1; i <= 4; i++) {
            const terminal = await freeTerminal();
            terminals.push(terminal);
        }
        await Promise.all(terminals.map((terminal, index) =>
            terminal.answer({
                name: `im player ${index + 1}`,
                service: 'spades',
                action: ['join-table', 'sit', 'ready'],
                table: 2,
                seat: index + 1,
            })));
        for (let i = 1; i <= 4; i++) {
            const terminal = await Util.waitUntil(() => terminals.find(terminal => terminal.prompts.bid));
            await terminal.answer({ bid: 3 })
        }
        expect(await Util.waitUntil(() =>
            Util.equalsDeep(
                ['im player 1', 'im player 2', 'im player 3', 'im player 4'],
                new Game({ history: terminals[0].history })
                    .players
                    .map(p => p.name)))).to.be.ok;
    });

    it('will end the game when one person stands up or disconnects', async () => {
        terminal = await Util.waitUntil(() => terminals.find(terminal => terminal.promptedFor({ name: 'action', value: 'stand' })));
        await terminal.answer({ action: 'stand' });                                                                         // ACT: stand
        await Util.waitUntil(() => terminals.every(t => t.promptedActivity.length === 1 && t.prompted.name === 'action'));  // ASSERT: every terminal is being prompted one table-service action, and no other prompts
        await Util.waitUntil(() => tableService.tables[1]?.ready === false);                                                // ASSERT: table 2 exists and is not ready
    });

    it('allows any un-seated person to leave the table', async () => {
        await terminal.answer({ action: 'leave-table' });
        await Util.waitUntil(async () => { return new TableService(terminal).tables[1].members.length === 3; });
    });

    it('allows you to leave the service to use another one', async () => {
        await terminal.answer({ action: ['leave-service'], service: 'stock ticker' });
        await Util.waitUntil(() => terminal.prompts.action);
        console.log(terminal.history);
    });

});
