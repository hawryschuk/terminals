import AWS from 'aws-sdk';
import { Util } from '@hawryschuk/common';
import { DynamoDBDAO } from '@hawryschuk/dao-aws';
import awsServerlessExpress from 'aws-serverless-express';
import { WebTerminal } from './WebTerminal';
import { TerminalRestApiServer2 } from './TerminalRestApiServer2';
import { DAO } from '@hawryschuk/dao';
DAO.cacheExpiry = 0;
const dao = new DynamoDBDAO({ WebTerminal });
const terminalServer = new TerminalRestApiServer2(dao);
const expressServer = awsServerlessExpress.createServer(terminalServer.expressApp);
let endpoint;
(async () => {  // get the websocket endpoint on prod
    const apigatewayv2 = new AWS.ApiGatewayV2();
    const { Items: apis } = await apigatewayv2.getApis().promise();
    const api: any = Util.findWhere(apis, { Name: 'terminals-websocket' });
    const { ApiEndpoint, ApiId } = api;
    const { Items: [{ StageName }] } = await apigatewayv2.getStages({ ApiId }).promise();
    endpoint = `${ApiEndpoint}/${StageName}`;
    terminalServer.wsuri = endpoint;
    terminalServer.notifySocket = async (socketId: string, message: any) => await new AWS
        .ApiGatewayManagementApi({ apiVersion: '2018-11-29', endpoint: endpoint.replace('wss://', 'https://') })
        .postToConnection({ ConnectionId: socketId, Data: JSON.stringify(message) })
        .promise();
})();

/** REST API : GET /services, POST /services/:service/:instance/:terminal & PUT {stdout/prompt} */
export const onRestApiEvent = (event, context) => {
    console.log({ endpoint, event })
    return awsServerlessExpress.proxy(expressServer, event, context);
}
