import { Util } from "@hawryschuk-common/util";
import { BaseService } from "./BaseService";
import { Messaging } from "Messaging";

/** For testing only */
export namespace TestingServices {
    export class BrowniePoints extends BaseService {
        static override NAME = 'Brownie Points';
        static override USERS = 1;
        async start() { return { winners: this.users, losers: [] }; }
    }
    export class GuessingGame extends BaseService {
        static override NAME = 'Guessing Game';
        static override USERS = [1, 2];
        async start() {
            const min = 1, max = 10;
            const random = Util.random({ min, max });
            await this.broadcast(`A random number has been chosen. Prompting each player to guess what it is.`);
            await Promise.all(this.users.map(seat => seat.prompt({ name: 'guess', message: `Guess a number between ${min} and ${max}`, min, max, type: 'number' })));
            const mapped = this
                .users
                .map(seat => ({ seat, distance: Math.abs(random - seat.input.guess) }))
                .sort((a, b) => a.distance - b.distance);
            const winners = mapped.filter(item => item.distance === mapped[0].distance).map(item => item.seat);
            const losers = this.users.filter(terminal => !winners.includes(terminal));
            await this.broadcast(`Every player has made their guess. The random number was ${random}. The winners are: ${winners.map(w => w.input.Name).join(', ')}`);
            await this.send('Congratulations! You won!', ...winners);
            await this.send('Unfortunately, you lost', ...losers);
            return { winners, losers };
        }
    }
}
