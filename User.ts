import { Util } from '@hawryschuk-common';
import { Model } from '@hawryschuk-crypto';

export class User extends Model {
    name!: string;
    location!: string;
    ratings!: {
        [service: string]: {
            rating: number;
            history: {
                datetime: number;
                points: number;
                winners: { name: string; rating: number; }[];
                losers: { name: string; rating: number; }[];
            }[]
        }
    }

    rating(service: string) {
        this.ratings ||= {};
        this.ratings[service] ||= { rating: 1500, history: [] };
        return this.ratings[service].rating;
    }

    /** Record a User's service history of winning, losing by maintaining an Elo record that starts at 1500 */
    static async record({ winners, losers, service, error } = {} as { winners: User[]; losers: User[]; service: string; error?: string; }) {
        /** Fetch the ratings of all the users (except robots/undefined) */
        for (const user of [...winners, ...losers]) if (user) await user.rating(service);

        /** When everyone wins ( everyone ties ) */
        if (losers.length > 1 && !winners.length) { winners = losers; losers = []; }
        if (winners.length > 1 && !losers.length) {
            await Promise.all(winners
                .map(user => {
                    const points = this.getRatingDelta(
                        user.ratings[service].rating,
                        winners.filter(u => u !== user).reduce((sum, user) => sum + user.ratings[service].rating, 0) / (winners.length - 1),
                        0.5
                    );
                    const ratings = Util.deepClone(user.ratings);
                    ratings[service].rating += points;
                    ratings[service].history.push({
                        points,
                        // error,
                        datetime: new Date().getTime(),
                        winners: winners.map(({ name, ratings }) => ({ name, rating: ratings[service].rating })),
                        losers: losers.map(({ name, ratings }) => ({ name, rating: ratings[service].rating })),
                    });
                    return { user, ratings }
                })
                .map(({ user, ratings }) =>
                    Object.assign(user, { ratings }).save()
                ))
        } else if (winners.length && losers.length) {
            const winnersRating = winners.length ? ((await Promise.all(winners.map(user => user.rating(service)))).reduce((sum, rating) => sum + rating, 0) / winners.length) : 0;
            const losersRating = losers.length ? (await Promise.all(losers.map(user => user.rating(service)))).reduce((sum, rating) => sum + rating, 0) / losers.length : 0;
            await Promise.all([...winners, ...losers]
                .map(user => {
                    const ratings = Util.deepClone(user.ratings);
                    const points = this.getRatingDelta(
                        winners.includes(user) ? winnersRating : losersRating,      // user a winner ? winners avg rating
                        winners.includes(user) ? losersRating : winnersRating,      // opponent a loser ? losers avg rating
                        winners.includes(user) ? 1 : 0                              // did user win or lose
                    );
                    ratings[service].rating += points;
                    ratings[service].history.push({
                        points,
                        datetime: new Date().getTime(),
                        winners: winners.map(({ name, ratings }) => ({ name, rating: ratings[service].rating })),
                        losers: losers.map(({ name, ratings }) => ({ name, rating: ratings[service].rating })),
                    });
                    return { user, ratings }
                })
                .map(({ user, ratings }) =>
                    Object.assign(user, { ratings }).save()
                ))
        }
    }

    /** Credit: https://github.com/moroshko/elo.js */
    static getRatingDelta(myRating: number, opponentRating: number, myGameResult: 0 | 0.5 | 1) {
        var myChanceToWin = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
        return Math.round(32 * (myGameResult - myChanceToWin));
    }

}