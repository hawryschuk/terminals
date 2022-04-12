import { Util } from '@hawryschuk/common';
import { DynamoDBDAO } from '@hawryschuk/dao-aws';
import { WebTerminal } from './WebTerminal';
import { TerminalRestApiServer2 } from './TerminalRestApiServer2';
import { Server as SocketIoServer } from 'socket.io';

export const listen = (port: number) => {
    const dao = new DynamoDBDAO({ WebTerminal });
    const restApiServer = new TerminalRestApiServer2(dao);
    const server = restApiServer.expressApp.listen(port);
    const socketInfo: any[] = [];
    const onTerminal = (socket: any) => async ({ service: service_id, instance: instance_id, terminal: terminal_id }) => {
        const { socketIds } = Object.assign(await dao.get<WebTerminal>(WebTerminal, terminal_id), { destroyed: new Date });
        socketIds.push(socket.id);
        socketInfo.push({ socket: socket.id, service_id, instance_id, terminal_id });
        await dao.update(WebTerminal, terminal_id, { socketIds });
        console.log('UPDATED THE socket ids!', socketIds)
    };
    const io = new SocketIoServer(server, { cors: { methods: ["GET", "POST"] } })
        .on('connection', socket => {
            console.log('on connection!', socket.id)
            socket.on('terminal', async body => {
                console.log('on terminal!', socket.id, body);
                const { service, instance, terminal } = body;
                terminal && await onTerminal(socket)({ service, instance, terminal });
            });
        })
        .on('disconnection', async socket => {
            console.log('on disconnection');
            const _socketInfo = Util.findWhere(socketInfo, { socket: socket.id });
            const { socketIds } = Object.assign(await dao.get<WebTerminal>(WebTerminal, _socketInfo.terminal), { destroyed: new Date });
            socketInfo.splice(socketInfo.indexOf(_socketInfo), 1);
            await dao.update(WebTerminal, _socketInfo.terminal, { socketIds: Util.without(socketIds, [socket.id]) });
        });
    restApiServer.notifySocket = async (id: string, message: any) => { console.log('notifying socket!'); io.to(id).emit('message', message); };
    console.log(`listening on ${port}`);
};

