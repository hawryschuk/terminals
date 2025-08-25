// import { SQLiteDAO } from '@hawryschuk-dao-sqlite';
// import { TerminalRestApiServer } from './TerminalRestApiServer';
// import { TableServiceHost } from "./TableServiceHost";
// import { User } from './User';
// import httpProxy from 'http-proxy';
// const stagingProxy = httpProxy.createProxyServer();

// const port: number = parseInt(process.env.PORT || process.argv.map(a => (/--port=(\d+)/.exec(a) || [])[1]).find(Boolean));
// const staging = process.argv.map(arg => (/--staging=(.+)/.exec(arg) || [])[1]).find(Boolean);
// if (port) (async () => {
//     // DAO.cacheExpiry = Infinity;
//     // SQLiteDAO.cacheExpiry = Infinity;
//     // const dao = new DAO(TerminalRestApiServer.models);
//     const dao = new SQLiteDAO(TerminalRestApiServer.models);
//     await dao.ready$;
//     // await dao.reset(); // TableServiceHost.maintain() also wipes all WebTerminal from the dao
//     const restApiServer = new TerminalRestApiServer(dao);
//     restApiServer.expressApp.get('/staging/*', (req, res) => {
//         stagingProxy.web(req, res, { target: 'http://localhost:4200/' });

//     });
//     restApiServer.expressApp.listen(port);
//     console.log(`listening on ${port}`);
//     TableServiceHost.maintain(dao).catch(e => {
//         console.error(e);
//         process.exit();
//     });
// })();