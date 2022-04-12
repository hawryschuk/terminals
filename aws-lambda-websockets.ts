/** WEB SOCKET : Updates the Terminal object with the WebSocket.id so it can be notified from REST API events */
import { DynamoDBDAO } from '@hawryschuk/dao-aws';
import { DAO } from '@hawryschuk/dao';
import { WebTerminal } from './WebTerminal';
import { atomic } from './TerminalRestApiServer2';
import { Util } from '@hawryschuk/common';
DAO.cacheExpiry = 0;
const dao = new DynamoDBDAO({ WebTerminal });
export const onWebSocketEvent = async (event, context) => {
    console.log({ event, context });
    const { eventType, domainName, stage, connectionId } = event.requestContext;
    if (eventType === 'DISCONNECT') {
        const terminal = Object
            .values(await dao.get<WebTerminal>(WebTerminal))
            .find(terminal => terminal.socketIds.includes(connectionId));
        console.log({ TERMINAL_DISCONNECTING: terminal });
        if (terminal)
            await atomic(`TerminalServer::WebTerminal::${terminal.id}`, async () => {
                const { owner, socketIds, history } = await dao.get<WebTerminal>(WebTerminal, terminal.id);
                const ownerDisconnection = socketIds.indexOf(connectionId) > 0;
                const appDisconnection = socketIds.indexOf(connectionId) === 0;
                const updates: WebTerminal = { socketIds: Util.without(socketIds, [connectionId]) } as any;
                if (appDisconnection) Object.assign(updates, { history: [...history, { type: 'app-disconnection', socketId: connectionId }] });
                if (ownerDisconnection) Object.assign(updates, { owner: null, history: [...history, { type: 'owner-disconnection', socketId: connectionId, formerOwner: owner }] });
                await dao.update(WebTerminal, terminal.id, updates);
                console.log('Disconnected!', { ownerDisconnection, appDisconnection, });
            });
    } else if (eventType === 'MESSAGE') {
        let { service, instance, terminal: terminalId, owner } = JSON.parse(event.body || '{}');
        const type = owner && 'owner' || 'app';
        if (terminalId && !await atomic(`TerminalServer::WebTerminal::${terminalId}`, async () => {
            const terminal: WebTerminal = await dao.get<WebTerminal>(WebTerminal, terminalId);
            if (terminal) {
                if (!terminal.socketIds) { console.log('this terminas socketids are not iteratble', terminalId, terminal) }
                await dao.update(WebTerminal, terminalId, {
                    socketIds: type === 'app' ? [connectionId, ...terminal.socketIds] : [...terminal.socketIds, connectionId],
                    history: [...terminal.history, { type: `${type}-connection`, socketId: connectionId }]
                });
                console.log('Connection!', { type, terminalId, owner, connectionId, });
            }
            return terminal;
        }))
            return { statusCode: 402, body: { error: 'unknown-terminal' } }
    }
    /** TODO: onDisconnect : update WebTerminal socketIds without connectionId -- though terminals do get auto-cleaned up after 5 minutes */
    return { statusCode: 200, body: '' };
};

