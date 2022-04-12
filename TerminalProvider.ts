import { Terminal } from './Terminal';

export class TerminalProvider {
    static get instance() { return (this as any)._instance ||= new TerminalProvider; }
    terminals = [] as Terminal[];
    getNewTerminal(terminal = new Terminal()) {
        this.terminals.push(terminal);
        return this.terminals[this.terminals.length - 1];
    }
}
