import chai from 'chai';
import chaiHttp from 'chai-http'; chai.use(chaiHttp);
import { WebTerminal } from './WebTerminal';
import { chaiExpressHttpClient } from './chaiExpressHttpClient';
import { TerminalRestApiServer } from './TerminalRestApiServer';
import { testTerminal } from './Terminal.spec.exports';

export const server = new TerminalRestApiServer();
WebTerminal.httpClient = chaiExpressHttpClient(server.expressApp);
WebTerminal.REFRESH = 10;
const terminal = WebTerminal.connect();

after(async () => {
    await (await terminal).finish();
    server.finish();
    setTimeout(() => process.exit(), 1000);
});

before(async () => {
    await terminal;
});

describe('WebTerminal', () => {
    testTerminal(terminal);
})
