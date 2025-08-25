import { expect } from 'chai';
import { Terminal } from './Terminal';
import { Util } from '@hawryschuk-common/util';

export const testTerminal = (terminal: Terminal) =>
    describe((terminal as any).constructor.name, () => {
        it('sends a message', async () => {                                                     // Feature #1: Terminal.send(message:any)
            await terminal.send('hello');
            expect(terminal).to.have.nested.property('history[0].message', 'hello');            // Feature #2: Terminal.history type=stdout, message=...
        });
        it('prompts for input', async () => {
            terminal.prompt({ name: 'age', type: 'number', message: 'what is your age' })  // Feature #3 : Terminal.prompt(options) 
        });
        it('indicates when the terminal is in a prompted state, and what the first prompt is', async () => {
            await Util.waitUntil(() => terminal.prompted);                                      // Feature #4 : Terminal.prompted
            expect(terminal.prompted).to.be.ok;
            expect(terminal).to.have.nested.property('prompted.name', 'age')                     //                      .prompted.name
        })
        it('responds to the first unresolved prompt', async () => {
            await terminal.respond(23);
        });
        it('provides the last values used for input', () => {
            expect(terminal.input.age).to.equal(23);
        });
        it('allows responding to simultaneous prompts', async () => {
            terminal.prompt({ name: 'shoe-size', type: 'text', message: 'what is your shoe size' });
            terminal.prompt({ name: 'waist-size', type: 'text', message: 'what is your waist size' });
            terminal.prompt({ name: 'location', type: 'text', message: 'where are you' });
            await Util.waitUntil(() => Object.keys(terminal.prompts).length === 3);
            await terminal.answer({ 'shoe-size': '16', location: 'ottawa' });
            expect(terminal.input.location).to.equal('ottawa');
            expect(terminal.input).to.have.nested.property('shoe-size', '16');
        });
        it('allows responding to a specific prompt, such as when there are multiple', async () => {
            terminal.prompt({ name: 'height', type: 'text', message: 'what is your height' });
            await Util.waitUntil(() => Object.keys(terminal.prompts).length === 2);
            expect(terminal.prompted!.name).to.equal('waist-size');
            await terminal.respond('200', 'height');
            expect(terminal.prompted!.name).to.equal('waist-size');
            expect(terminal.input.height).to.equal('200');
        });
        it('finishes a terminal', async () => {
            await terminal.finish();
            expect(terminal.finished).to.be.ok;
        });
    });
