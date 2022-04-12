import { DAO, Model } from '@hawryschuk/dao';
import { Util } from '@hawryschuk/common';
import { Prompt } from './Prompt';
import { TerminalActivity } from './TerminalActivity';
export { TerminalActivity } from './TerminalActivity';

export class Terminal extends Model {
    static instances: Terminal[] = [];
    public id: string;
    public owner?: any;
    public history: TerminalActivity[];
    public started = new Date;
    public finished?: Date;

    constructor({
        id = 'terminal' + (Terminal.instances.length + 1),
        owner,
        history = [] as TerminalActivity[],
    } = {} as {
        id?: string;
        history?: TerminalActivity[];
        owner?: any;
    }, dao = DAO.instance) {
        super({}, dao);
        this.id = id;
        if (owner && !Util.equalsDeep(owner, {})) this.owner = owner;
        this.history = history;
        Terminal.instances.push(this);
    }

    get subscribers(): { handler: Function; event?: string; }[] { return (this as any)[Symbol.for('subscribers')] ||= []; }
    subscribe(options: { handler: Function; event?: string; }) { this.subscribers.push(options); return this; }
    async notify(event: any = this.last) { await Promise.all(this.subscribers.map(s => s.handler(event))); }

    read() { return this.buffer; }
    write(v: any) { this.send(v); }
    async respond(value: any) {
        const { last } = this;
        if (!this.prompted) throw new Error('cannot respond to a question not asked');
        this.prompted.resolved = value;
        console.log('responded: notifying...');
        this.notify();
    }

    get last(): TerminalActivity { return (this.history || []).slice(-1)[0] }

    get prompted(): Prompt { return this.last?.type === 'prompt' && this.last.options?.resolved === undefined && this.last.options as any; }

    get buffer() {
        return this.history
            .filter(item => item.type !== 'prompt' || item.options?.resolved !== undefined)
            .map(item => item.message || (item.options?.resolved !== undefined ? `${item.options?.message} ${item.options?.resolved}` : item.options?.message))
            .join('\n');
    }

    async send(message: any) {
        this.history.push({ type: 'stdout', message });
        console.log('sent message: notifying...');
        this.notify();
    }

    async prompt(options: Prompt): Promise<any> {
        const { history: { length } } = this;
        this.history.push({ type: 'prompt', options });
        this.notify();
        return await Util
            .waitUntil(() => 'resolved' in this.history[length].options!)
            .then(() => this.history[length].options!.resolved);
    }
}



