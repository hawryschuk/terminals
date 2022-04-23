import { expect } from 'chai';
import { Util } from '@hawryschuk/common';
import { DAO } from '@hawryschuk/dao';
import { TerminalRestApiServer } from './TerminalRestApiServer';
import { WebTerminal } from './WebTerminal';
import { User } from './User';
import { TableServiceHost } from "./TableServiceHost";

DAO.cacheExpiry = Infinity;

export const dao = new DAO(TerminalRestApiServer.models);

export const freeTerminal = async (): Promise<WebTerminal> => await Util.waitUntil(async () => {
    const terminal = Object
        .values(await dao.get<WebTerminal[]>(WebTerminal))
        .find((terminal: WebTerminal) => terminal.available && terminal.service === 'table-service');
    terminal && await terminal.update$({ owner: new Date().getTime() });
    return terminal;
});

export let terminal: WebTerminal;

describe('Table Services Host', async () => {
    it('As a SaaS host, we will consistently maintain some available WebTerminal instances', async () => {
        TableServiceHost.maintain(dao);
        terminal = await freeTerminal();
        expect(terminal).to.be.ok;
    });
});
