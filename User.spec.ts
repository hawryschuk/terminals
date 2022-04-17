import { Model, DAO } from '@hawryschuk/dao';
import { Util } from '@hawryschuk/common';
import { User } from './User';
import { expect } from 'chai';
describe('User', () => {
    it('tracks the ratings of a user', async () => {
        const users = new Array(10).fill(0).map(() => new User({ name: Util.UUID, id: Util.UUID }, null));
        await Promise.all(users.map(u => u.rating('spades')));
        users[1].ratings.spades.rating += 100;      // loses 20 points 
        users[3].ratings.spades.rating += 100;      // wins  12 points
        await User.record({ winners: [users[0]], losers: [users[1]], service: 'spades' })
        await User.record({ winners: [users[3]], losers: [users[2]], service: 'spades' })
        expect(users[1]).to.have.nested.property('ratings.spades.rating', 1580);
        expect(users[3]).to.have.nested.property('ratings.spades.history[0].points', 12);
        expect(users[3]).to.have.nested.property('ratings.spades.rating', 1612);

        users[4].ratings.spades.rating += 100;      // loses 4 points for tieing with someone 100 less than
        await User.record({ winners: [users[4], users[5]], losers: [], service: 'spades' })
        expect(users[4]).to.have.nested.property('ratings.spades.rating', 1596);

        await User.record({ winners: [users[6]], losers: [], service: 'spades' })
        expect(users[6]).to.have.nested.property('ratings.spades.rating', 1500);
    })
})