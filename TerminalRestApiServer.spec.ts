import chaiHttp from 'chai-http';
import chai, { expect } from 'chai'; const should = chai.should(); chai.use(chaiHttp);
import { Util } from '@hawryschuk/common';
import { TerminalRestApiServer } from './TerminalRestApiServer';
import { TerminalRestApiClient } from './TerminalRestApiClient';
import { chaiExpressHttpClient } from './chaiExpressHttpClient';
import { Terminal } from './Terminal';
import { HelloWorldService } from './HelloWorldService';
import { WebTerminal } from './WebTerminal';
import { axiosHttpClient } from './axiosHttpClient';
const baseuri = '' && ('http://localhost:8001' || 'https://hawryschuk-terminals.glitch.me/');
const server = new TerminalRestApiServer();
let terminal: WebTerminal;
// Util.debug = true;

describe('Terminal Services REST-API Server', () => {
    before(() => { TerminalRestApiClient.httpClient = baseuri ? axiosHttpClient(baseuri) : chaiExpressHttpClient(server.expressApp); })

    it('can create a new web-terminal', async () => {
        terminal = await WebTerminal.createTerminal({ baseuri: '', service: 'hello-world', instance: 'instance1', terminal: 'terminal1', owner: { name: 'alex' } });
    });

    it.skip('prevents overriding ownership', () => {

    });

    it.skip('secures terminal ownership', () => {
        let terminal: any;
        const pubkey = 'xxx';
        terminal.secure(pubkey);
    })

    it('allows claiming terminal ownership -- allows overriding ownership', async () => {
        await terminal.claim({ name: 'alex2' });
        expect(terminal.owner).to.deep.equal({ name: 'alex2' });
    });

    it('terminals can be given to applications for [multi]-user interaction as a standard communications interface (which can extend to standards-implemented gui, voice-based, brail, etc user interfaces)', () => {
        new HelloWorldService(terminal).play();
    })

    // it.skip('provides a list of services', async () => {
    //     expect(await WebTerminal.Services).to.have.nested.property('[0].serviceId');
    // });

    it('provides service-instance-terminal-details', async () => {
        expect(await WebTerminal.Terminals).to.have.nested.property('[0].id');
    });

    it('edge-case: error: cannot respond when not-prompted', async () => {
        expect(terminal.prompted).to.not.be.ok;
        expect(await terminal
            .respond('abc', 'non-existent')
            .then(() => '')
            .catch(e => {
                console.error(e);
                return /not-prompted|unknown-item/.test(e.message);
            })
        ).to.be.ok;
    });

    it('allows the user to respond to prompts from the terminal', async () => {
        await terminal.answer({ name: 'alex', country: 'canada' });
    });

    it('edge-case: prevents responding twice', async () => {
        expect(await terminal.respond('ecuador', 'country').then(() => '').catch(e => {
            return /already-resolved|not-prompted|unknown-item/.test(e.message);
        })).to.be.ok;
    });

    it('indicates if and when a service-instance is finished', async () => {
        await Util.waitUntil(() => terminal.finished);
    });

});
