#!/usr/bin/env ts-node

// import { TerminalRestApiClient } from './TerminalRestApiClient';
// import { axiosHttpClient } from './axiosHttpClient';
import { ConsoleTerminal } from './ConsoleTerminal';
import { WebTerminal } from './WebTerminal';
import { Terminal } from './Terminal';
import { Util } from '@hawryschuk-common';
// // AWS.config.update({ region: 'us-east-1' });
// // TerminalRestApiClient.httpClient = axiosHttpClient('https://96fh0ga37c.execute-api.us-east-1.amazonaws.com/prod');

const validargs = 'hello-world meetups websockets update-layers port baseuri wsuri'.split(' ');
if (!validargs.some(validarg => process.argv.some(arg => arg.startsWith(`--${validarg}`))) || process.argv.some(a => a.includes('--help'))) {
    console.log(`
Help: ts-node cli
    --port                      -- starts a local server on the port specified with table-service running
    --baseuri                   -- establishes a WebTerminal connection to the baseuri    

    --websockets                -- get the aws:apigateway webocket endpoint
    --update-layers             -- configures aws:lambda to use the latest layer versions

    --hello-world               -- a simple single interactive console terminal application
    --meetups                   -- a simple two-terminal application : console-terminal and web-terminal

    --help
`)
}

// /** Start the server on the given port : ts-node cli --port==8001 (spades, meetups, hello-world) */
// // require('./app.server');

// /** Connect to any remote web-terminal at the specified baseuri and wsuri */
// const baseuri = process.argv.map(a => (/--baseuri=(.+)/.exec(a) || [])[1]).find(Boolean)
// if (baseuri) (async () => {
//     TerminalRestApiClient.httpClient = axiosHttpClient(baseuri);
//     const [{ service, instance, id }] = await TerminalRestApiClient.freeTerminals;
//     const terminal = (await WebTerminal.retrieve({ service, instance, id, owner: 'cli' }))!;
//     const _console = new ConsoleTerminal();
//     let processed = 0;
//     terminal.subscribe({
//         handler: async (last: any) => {
//             console.log('webterminal sent ', last)
//             if (last?.type === 'prompt' && !('resolved' in last.options!)) {
//                 const answer = await (_console.prompt({ ...last.options }));
//                 await terminal.respond(answer)
//             }
//             else if (last?.type === 'stdout') {
//                 await (_console.send(last.message));
//             }
//             if (last?.message === 'finished')
//                 terminal.finished = new Date();
//         }
//     });
//     for (const item of terminal.history) {
//         await terminal.notify(item);
//     }
// })();

// /** Sample of Console-Terminal App */
// if (process.argv.some(a => /--hello-world/.test(a))) new HelloWorldService(new ConsoleTerminal).play();

// /** Sample of Two-Terminal App */
// if (process.argv.some(a => /--meetups/.test(a))) new MeetupsService(new ConsoleTerminal, new ConsoleTerminal).play();

// /** Display the aws:apigateway websocket endpoint */
// // if (process.argv.some(a => a.includes('--websockets'))) {
// //     (async () => {
// //         const apigatewayv2 = new AWS.ApiGatewayV2();
// //         const { Items: apis } = await apigatewayv2.getApis().promise();
// //         const api: any = Util.findWhere(apis, { Name: 'terminals-websocket' });
// //         const { ApiEndpoint, ApiId } = api;
// //         const { Items: [{ StageName }] } = await apigatewayv2.getStages({ ApiId }).promise();
// //         const endpoint = `${ApiEndpoint}/${StageName}`;
// //         console.log({ endpoint });
// //         return endpoint;
// //     })();
// // }

// /** Update the AWS Lambda's Layer Verisions */
// // if (process.argv.some(a => /--update-layers/.test(a)))
// //     (async () => {
// //         const log = data => console.log(JSON.stringify(data, null, 2));
// //         const lambda = new AWS.Lambda();
// //         const Layers = await lambda.listLayers().promise().then(r => r.Layers.map(l => l.LatestMatchingVersion.LayerVersionArn).filter(l => /:terminal-/.test(l)));
// //         await lambda.updateFunctionConfiguration({ FunctionName: 'terminals2', Layers }).promise();
// //         await lambda.updateFunctionConfiguration({ FunctionName: 'terminals1', Layers }).promise();
// //     })();
