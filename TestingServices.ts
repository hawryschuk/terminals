import { Util } from "@hawryschuk-common/util";
import { BaseService } from "./BaseService";

/** For testing only */
export namespace TestingServices {
    export class BrowniePoints extends BaseService {
        static override NAME = 'Brownie Points';
        static override USERS = 1;

        async start() { return { winners: this.seats.map(s => s.terminal!.id), losers: [] }; }
    }
    export class GuessingGame extends BaseService {
        static override NAME = 'Guessing Game';
        static override USERS = [1, 2];
        async start() {
            const min = 1, max = 10;
            const random = Util.random({ min, max });
            await this.broadcast(`A random number has been chosen. Prompting each player to guess what it is.`);
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
