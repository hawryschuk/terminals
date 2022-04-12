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
        return this.httpClient({ url: 'services' });
    }

    static get freeTerminals() { return this.terminals.then(terminals => terminals.filter(terminal => terminal.available)); }

    static get terminals(): Promise<{
        service: string;
        instance: string;
        terminal: string;
        available: boolean;
    }[]> {
        return this.services.then((services) => {
            console.log({ services }); return services.reduce((terminals, service) => [
                ...terminals,
                ...service.instances.reduce(
                    (terminals: any[], instance: any) => [
                        ...terminals,
                        ...instance
                            .terminals
                            .map((terminal: any) => ({
                                service: terminal.service,
                                instance: terminal.instance,
                                terminal: terminal.id,
                                owner: terminal.owner,
                                finished: terminal.finished,
                                available: (!terminal.owner || Util.equalsDeep(terminal.owner, {})) && !terminal.finished
                            }))
                    ], [] as any)
            ], [] as {
                service: string;
                instance: string;
                description?: string; // TODO
                terminal: string;
                available: boolean;
            }[])
        });
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
        return this.httpClient({
            method: 'get', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}`
        });
    }

    static getWebSocketsUri(): Promise<string> {
        return this.httpClient({ method: 'get', url: `wsuri` }).then(result => result.wsuri);
    }

    static deleteTerminalOwnership(serviceId: string, instanceId: string, terminalId: string) {
        return this.httpClient({
            method: 'delete', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}/owner`,
        });
    }

    static respondToPrompt(serviceId: string, instanceId: string, terminalId: string, response: any) {
        return this.httpClient({
            method: 'post', url: `services/${serviceId}/${instanceId}/terminals/${terminalId}/response`, body: { response },
        });
    }

}
