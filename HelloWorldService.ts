import { Util } from '@hawryschuk/common';
import { Terminal } from "./Terminal";

/** A simple application that sends,prompts,sends,prompts,sends */
export class HelloWorldService {
    hello = 'world';
    constructor(public terminal: Terminal) { }
    async play() {
        await this.terminal.send('Taking 2 seconds to warm up...');
        await Util.pause(2000);
        const name = await this.terminal.prompt({ type: 'text', message: 'what is your name dude?', name: 'name' });
        await this.terminal.send(`it's great to meet you, ${name}`);
        const country = await this.terminal.prompt({ type: 'text', message: 'what country do you live in?', name: 'country' });
        await Util.pause(2000);
        await this.terminal.send(`${name}, see you in ${country}`);
    }
}

