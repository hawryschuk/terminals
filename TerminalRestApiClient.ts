import { Terminal } from './Terminal';
import { MinimalHttpClient } from './MinimalHttpClient';
import { TerminalActivity } from './TerminalActivity';
import { Prompt } from './Prompt';
import { WebTerminal } from './WebTerminal';
import { Util } from '@hawryschuk/common';

/** The whole class is static ; the server is remote, and each method is disconnected */
export class TerminalRestApiClient {
    static httpClient: MinimalHttpClient;

    static get services(): Promise<{
        serviceId: string;
        instances: {
            serviceInstanceId: string;
            terminals: WebTerminal[];
        }[];
    }[]> {
        return this
            .httpClient({ url: 'services' })
            .then(services => {
                if (!(services instanceof Array)) throw new Error(`unknown services - ${services}`);
                for (const service of services) {
                    for (const instance of service.instances) {
                        instance.terminals.forEach((terminal: any, i: number) => {
                            instance.terminals[i] = new WebTerminal(terminal);
                        })
                    }
                }
                return services;
            });
    }

    static get freeTerminals() {
        return this.terminals.then(terminals => Util.where(terminals, { available: true }));
    }

    static get terminals(): Promise<WebTerminal[]> {
        return this
            .httpClient({ url: 'terminals' })
            .then((terminals: any[]) => terminals.map((terminal: any) => new WebTerminal(terminal)));
    }

    static async createTerminal(serviceId: string, instanceId: string, terminalId: string): Promise<Terminal> {
        return await this.httpClient({
            method: 'post', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}`
        });
    }

    static async deleteTerminal(serviceId: string, instanceId: string, terminalId: string): Promise<Terminal> {
        return await this.httpClient({
            method: 'delete', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}`
        });
    }

    static async getTerminalOwnership(serviceId: string, instanceId: string, terminalId: string, owner: any): Promise<Terminal> {
        return this.httpClient && await this.httpClient({
            method: 'put', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}/owner`, body: { owner },
        });
    }

    static async send(serviceId: string, instanceId: string, terminalId: string, message: any): Promise<Terminal> {
        return await this.httpClient({
            method: 'put', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}`, body: { type: 'stdout', message },
        });
    }

    static async prompt(serviceId: string, instanceId: string, terminalId: string, options: Prompt): Promise<Terminal> {
        return await this.httpClient({
            method: 'put', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}`, body: { type: 'prompt', options },
        });
    }

    static async setTerminalHistory(serviceId: string, instanceId: string, terminalId: string, history: TerminalActivity[]): Promise<Terminal> {
        return await this.httpClient({
            method: 'put', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}/history`, body: history,
        });
    }

    static async getTerminalHistory(serviceId: string, instanceId: string, terminalId: string, start = 0): Promise<TerminalActivity[]> {
        return await this.httpClient({
            method: 'get', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}/history?start=${start}`,
        });
    }

    static getTerminalInfo(serviceId: string, instanceId: string, terminalId: string): Promise<WebTerminal> {
        return this
            .httpClient({ method: 'get', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}` })
            .then(terminal => terminal && new WebTerminal(terminal));
    }

    static getWebSocketsUri(): Promise<string> {
        return this.httpClient({ method: 'get', url: `wsuri` }).then(result => result.wsuri);
    }

    static deleteTerminalOwnership(serviceId: string, instanceId: string, terminalId: string) {
        return this.httpClient({
            method: 'delete', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}/owner`,
        });
    }

    static respondToPrompt(serviceId: string, instanceId: string, terminalId: string, response: any, name: string, index: number): Promise<{ name: string, index: number, value: any }> {
        return this.httpClient({
            method: 'post', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}/response`, body: { response, index, name },
        });
    }

}
