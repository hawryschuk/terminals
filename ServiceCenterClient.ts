import { Util } from "@hawryschuk-common";
import { MinimalHttpClient } from "MinimalHttpClient";
import { Messaging, BaseService } from "ServiceCenter";
import { Terminal } from "Terminal";
import { WebTerminal } from "WebTerminal";


export class ServiceCenterClient {
    constructor(public terminal: Terminal) { }

    get LoungeMessages(): Array<Messaging.LoungeMessage> {
        return this.terminal.history.filter(m => m.message?.type === 'loungeMessage').map(m => m.message) as any;
    }

    get Tables(): Messaging.Tables['tables'] | undefined {
        return this.terminal.history.filter(m => m.message?.type === 'tables').pop()?.message.tables as any;
    }

    get ServiceStarted() {
        const started = this.terminal.history.filter(m => m.message?.type == 'start-service').pop();
        const ended = this.terminal.history.filter(m => m.message?.type == 'end-service').pop();
        return !!started && (!ended || this.terminal.history.indexOf(ended) < this.terminal.history.indexOf(started));
    }

    get ServiceEnded(): Messaging.ServiceResult['results'] | undefined {
        const started = this.terminal.history.filter(m => m.message?.type == 'start-service').pop();
        const ended = this.terminal.history.filter(m => m.message?.type == 'end-service').pop();
        return !!ended && this.terminal.history.indexOf(ended) > this.terminal.history.indexOf(started!)
            ? ended.message.results
            : undefined;
    }

    get Results() {
        return Util.waitUntil(() => this.ServiceEnded!);
    }

    static async create({ terminal, httpClient, baseuri }: { terminal?: Terminal; httpClient?: MinimalHttpClient; baseuri?: string; } = {}) {
        terminal ||= (baseuri || httpClient)
            ? await WebTerminal.connect({ baseuri, httpClient })
            : new Terminal;
        if (terminal instanceof WebTerminal) {
            await terminal.request({ method: 'get', url: 'service', body: { id: terminal.id } });
        }
        return new ServiceCenterClient(terminal!);
    }

    async SelectMenu(title: string) {
        await Util.waitUntil(async () => {
            const [prompt] = await Util.waitUntil(() => this.terminal.prompts.menu);
            const choice = Util.findWhere(prompt.choices!, { title })!;
            await this.terminal.answer({ menu: choice.value });
            return !choice.disabled;
        });
    }

    async CreateTable(seats?: number) {
        await this.SelectMenu('Create Table');
        const Service = await this.Service;
        const willPromptForSeats = Service!.USERS instanceof Array || Service!.USERS === '*';
        if (seats) await this.terminal.answer({ seats });
        return seats || !willPromptForSeats
            ? await Util.waitUntil(() => this.terminal.input.table as string)
            : undefined;
    }

    async ListTables() {
        await this.SelectMenu('List Tables');
        return await Util.waitUntil(() => this.Tables!);
    }

    async LeaveTable() {
        await this.SelectMenu('Leave Table');
        return await Util.waitUntil(() => !this.terminal.input.table);
    }

    async JoinTable(id: string) {
        await this.SelectMenu('Join Table');
        await this.terminal.answer({ table: id });
        await Util.waitUntil(() => this.terminal.input.table === id);
    }

    async Sit() {
        await this.SelectMenu('Sit');
        await Util.waitUntil(() => this.terminal.input.seat);
    }

    async Ready() {
        await this.SelectMenu('Ready');
        await Util.waitUntil(() => this.terminal.input.ready);
    }

    async Name(name: string) {
        await this.terminal.answer({ name });
    }

    get Services() { return Util.waitUntil(() => (this.terminal.prompts2.service?.pop()?.choices)!); }
    get Service(): Promise<undefined | { value: string; title: string; USERS: (typeof BaseService)['USERS']; }> {
        return this.Services.then(services => services.find(service => service.value === this.terminal.input.service)) as any;
    }

    async SetService(title: string) {
        const { value: id } = Util.findWhere(await this.Services, { title })!;
        await this.terminal.answer({ service: id });
        await Util.waitUntil(() => this.terminal.input.service === id);
    }

    get NameInUse() {
        return this.terminal.prompts.name && this.terminal.history.some(i => i.message?.type === 'name-in-use');
    }

}
