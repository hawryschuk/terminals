import chaiHttp from 'chai-http';
import chai, { expect } from 'chai'; const should = chai.should(); chai.use(chaiHttp);
import { Util } from '@hawryschuk/common';
import { TerminalRestApiServer2 } from './TerminalRestApiServer2';
import { TerminalRestApiClient } from './TerminalRestApiClient';
import { chaiExpressHttpClient } from './chaiExpressHttpClient';
import { Terminal } from './Terminal';
import { HelloWorldService } from 'HelloWorldService';
import { WebTerminal } from 'WebTerminal';

const server = new TerminalRestApiServer2()

before(async () => {
    TerminalRestApiClient.httpClient = chaiExpressHttpClient(server.expressApp);
    const terminal = await WebTerminal.createTerminal({ wsuri: '', baseuri: '', service: 'hello-world', instance: 'instance1', terminal: 'terminal1', owner: { name: 'alex' } });
    const service = new HelloWorldService(terminal);
    service.play();
});

describe('Terminal Services REST-API Server', () => {
    it('provides a list of service ids', async () => {
        expect(await TerminalRestApiClient.services).to.have.nested.property('[0].id', 'hello-world');
    });

    // it('creates service instances', async () => {
    //     await TerminalRestApiClient.createInstance('hello-world', 'abc');
    //     expect(await TerminalRestApiClient.services).to.have.nested.property('[0].instances[1].id', 'abc');
    // });

    it('provides service-instance-terminal-details', async () => {
        expect(await TerminalRestApiClient.services).to.have.nested.property('[0].instances[0].id');
        expect(await TerminalRestApiClient.services).to.have.nested.property('[0].instances[0].terminals[0].id');
    });

    it('allows terminal [promptee] claimance', async () => {
        const [{ serviceId, instances: [{ serviceInstanceId, terminals: [{ id: terminalId }] }] }] = await TerminalRestApiClient.services;
        await TerminalRestApiClient.getTerminalOwnership(serviceId, serviceInstanceId, terminalId, { name: 'alex' });
        expect(await TerminalRestApiClient.services).to.have.nested.property('[0].instances[0].terminals[0].owner.name', 'alex');
    });

    it('throws an error when responding when not-prompted (the service will not prompt until after 2 seconds of warming up', async () => {
        const [{ serviceId, instances: [{ serviceInstanceId, terminals: [{ id: terminalId }] }] }] = await TerminalRestApiClient.services;
        expect(await TerminalRestApiClient
            .respondToPrompt(serviceId, serviceInstanceId, terminalId, 'canada')
            .catch(e => e.message))
            .to.equal('not-prompted');
    });

    it.skip('allows the user to respond to prompts from the terminal', async () => {
        await Util.pause(2000); // after 2 seconds of warm up will the 
        const [{ serviceId, instances: [{ serviceInstanceId, terminals: [{ id: terminalId }] }] }] = await TerminalRestApiClient.services;
        await Util.waitUntil(() => TerminalRestApiClient.getTerminalInfo(serviceId, serviceInstanceId, terminalId).then(t => t.prompted));
        await TerminalRestApiClient.respondToPrompt(serviceId, serviceInstanceId, terminalId, 'alex'); // what is your name
        const terminal: Terminal = await Util.waitUntil(() => TerminalRestApiClient.getTerminalInfo(serviceId, serviceInstanceId, terminalId));
        expect(terminal).to.have.nested.property('owner.name', 'alex');
        expect(terminal).to.have.nested.property('history[1].options.resolved', 'alex');
        expect(terminal).to.have.nested.property('history[2].message', `it's great to meet you, alex`);
        expect(terminal).to.have.nested.property('history[3].options.message', `what country do you live in?`);
        await TerminalRestApiClient.respondToPrompt(serviceId, serviceInstanceId, terminalId, 'canada');
        expect(terminal).to.have.nested.property('history[3].options.resolved', `canada`);
    });

    it.skip('edge-case: prevents responding twice', async () => {
        const [{ serviceId, instances: [{ serviceInstanceId, terminals: [{ id: terminalId }] }] }] = await TerminalRestApiClient.services;
        expect(await TerminalRestApiClient.respondToPrompt(serviceId, serviceInstanceId, terminalId, 'ecuador').catch(e => e.message)).to.equal('already-resolved');
    });

    it.skip('indicates if and when a service-instance is finished', async () => {
        await Util.pause(3000);
        console.log(Util.safeStringify(await TerminalRestApiClient.services))
        expect(await TerminalRestApiClient.services).to.have.nested.property('[0].instances[0].finished');
    });

    it('when an instance finishes, a new one is created', async () => {
        expect(await TerminalRestApiClient.services).to.have.nested.property('[0].instances[1]');
    });

    it('when all the instances are busy, more are created', async () => {
        const getCount = async () => (await TerminalRestApiClient.terminals).length;
        const before = await getCount();
        while (await getCount() < before + 5) {
            for (const { service, instance, terminal } of await TerminalRestApiClient.freeTerminals) {
                await TerminalRestApiClient.getTerminalOwnership(service, instance, terminal, { name: 'test-' + Util.UUID });
            }
        }
        expect(await getCount()).to.be.greaterThan(before)
    });

});
