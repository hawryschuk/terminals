import { Terminal } from "./Terminal";

export class MeetupsService {
    players: any[];

    constructor(
        terminal1: Terminal,
        terminal2: Terminal
    ) {
        this.players = [terminal1, terminal2].map(terminal => ({ terminal }));
    }

    async play() {
        await Promise.all(this.players.map(async player => player.name = await player.terminal.prompt({ type: 'text', message: 'Hello! What is your name?', name: 'name' })));
        await Promise.all(this.players.map(player => player.terminal.send('these are the players: ' + this.players.map(p => p.name).join(', '))));
        await Promise.all(this.players.map(async (player, index) => player.wants_to_meet = await player.terminal.prompt({ type: 'text', message: `${player.name}, would you like to want to meet "${this.players[(index + 1) % 2].name}"?` })));
        await Promise.all(this.players.map((player, index) => player.terminal.send(
            this.players.every(p => p.wants_to_meet) && `mutual concensus to meet`
            || this.players.every(p => !p.wants_to_meet) && `mutual consensus to not meet`
            || `immutual`
        )));
    }
}
