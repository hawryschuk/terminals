import chai from 'chai';
import chaiHttp from 'chai-http'; chai.use(chaiHttp);
import { WebTerminal } from './WebTerminal';
import { chaiExpressHttpClient } from './chaiExpressHttpClient';
import { TerminalRestApiServer } from './TerminalRestApiServer';
import { testTerminal } from './Terminal.spec.exports';

(async () => {
    const server = new TerminalRestApiServer();
    WebTerminal.httpClient = chaiExpressHttpClient(server.expressApp);
    WebTerminal.REFRESH = 10;
    const terminal = await WebTerminal.connect();
    testTerminal(terminal);
})();