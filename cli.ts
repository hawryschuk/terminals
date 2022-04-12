#!/usr/bin/env ts-node

import { prompt } from 'prompts';
import { Util } from '@hawryschuk/common';
import { MeetupsService } from './MeetupsService';
import { TerminalRestApiClient } from './TerminalRestApiClient';
import { axiosHttpClient } from './axiosHttpClient';
import { ConsoleTerminal } from './ConsoleTerminal';
import { listen } from './app.socketio';
import * as AWS from 'aws-sdk';
import { HelloWorldService } from './HelloWorldService';
AWS.config.update({ region: 'us-east-1' });
TerminalRestApiClient.httpClient = axiosHttpClient('https://96fh0ga37c.execute-api.us-east-1.amazonaws.com/prod');

const validargs = 'hello-world meetups websockets update-layers port baseuri wsuri'.split(' ');
if (!validargs.some(validarg => process.argv.some(arg => arg.startsWith(`--${validarg}`))) || process.argv.some(a => a.includes('--help'))) {
    console.log(`Help: ts-node cli
    --hello-world               -- a simple single interactive console terminal application
    --meetups                   -- a simple two-terminal application : console-terminal and web-terminal
    --websockets                -- get the aws:apigateway webocket endpoint
    --update-layers             -- configures the lambda to use the latest layer versions
    --port                      -- starts a local server on the port specified
    --baseuri                   -- starts a WebTerminal that connects to the baseuri
    --help
`)
}

/** Start the server on the given port : ts-node cli --port==8001 (spades, meetups, hello-world) */
const port = process.argv.map(a => parseInt((/--port=(\d+)/.exec(a) || [])[1])).find(Boolean);
if (port) listen(port);

/** Sample of Two-Terminal App */
if (process.argv.some(a => /--meetups/.test(a))) new MeetupsService(new ConsoleTerminal, new ConsoleTerminal).play();

/** Sample of Console-Terminal App */
if (process.argv.some(a => /--hello-world/.test(a))) new HelloWorldService(new ConsoleTerminal).play();

/** Display the aws:apigateway websocket endpoint */
if (process.argv.some(a => a.includes('--websockets'))) {
    (async () => {
        const apigatewayv2 = new AWS.ApiGatewayV2();
        const { Items: apis } = await apigatewayv2.getApis().promise();
        const api: any = Util.findWhere(apis, { Name: 'terminals-websocket' });
        const { ApiEndpoint, ApiId } = api;
        const { Items: [{ StageName }] } = await apigatewayv2.getStages({ ApiId }).promise();
        const endpoint = `${ApiEndpoint}/${StageName}`;
        console.log({ endpoint });
        return endpoint;
    })();
}

/** Update the AWS Lambda's Layer Verisions */
if (process.argv.some(a => /--update-layers/.test(a)))
    (async () => {
        const log = data => console.log(JSON.stringify(data, null, 2));
        const lambda = new AWS.Lambda();

        const Layers = await lambda.listLayers().promise().then(r => r.Layers.map(l => l.LatestMatchingVersion.LayerVersionArn).filter(l => /:terminal-/.test(l)));
        await lambda.updateFunctionConfiguration({ FunctionName: 'terminals2', Layers }).promise();
        await lambda.updateFunctionConfiguration({ FunctionName: 'terminals1', Layers }).promise();
    })();

/** Connect to any remote web-terminal at the specified baseuri and wsuri */
const terminalOwner = process.argv.map(a => (/--baseuri=(.+)/.exec(a) || [])[1]).find(Boolean);
if (terminalOwner) (async () => {
    await Util.pause(2000);
    const freeSpades = await Util.waitUntil(async () => Util.findWhere(await TerminalRestApiClient.terminals, { service: 'Game', available: true }));
    const { service, instance, terminal, available } = freeSpades;
    let lastIndex = 0;
    await TerminalRestApiClient.getTerminalOwnership(service, instance, terminal, { name: 'alex-in-console' });
    while (lastIndex >= 0) {
        const info = await TerminalRestApiClient.getTerminalInfo(service, instance, terminal);
        const newActivity = info.history.slice(lastIndex); lastIndex += newActivity.length;
        const [last] = newActivity.slice(-1);
        for (const { type, message, options } of newActivity) {
            if (type === 'stdout') console.log(message);
            if (type === 'prompt') await TerminalRestApiClient.respondToPrompt(service, instance, terminal, (await prompt({ ...options, name: 'response' })).response);
        }
        if (info.finished) lastIndex = -1;
        else await Util.pause(250);
    }

})();