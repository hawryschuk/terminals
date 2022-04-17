import { Util } from '@hawryschuk/common';
import { DAO, Model } from '@hawryschuk/dao';
import { WebTerminal } from "./WebTerminal";
import { Table } from './Table';
import { Service } from './Service';
import { Seat } from './Seat';
import { TableServiceHost } from './TableServiceHost';
import { User } from './User';
import { Terminal } from './Terminal';
import { join } from 'path';

/** TableService brings users together to participate in other services 
 * 1) name = ? (alex)
 * 2) service = ? ( spades )
 * 3) chat, join-table, boot-robot 1, invite-robot 1, sit 1, stand 1, leave-table
 * 4) ready
 * 5) use the service until it completes...
 * 6) everyone becomes unready
 * choosing a service (spades/stock.ticker), lounge-service */
export class TableService {
    constructor(public terminal: Terminal) { }

    get state() {
        return !this.name && 'give-name'                            // alex
            || !this.service && 'select-service'                    // spades
            || !this.table && 'join-table'                          // 1
            || !this.seat && 'take-seat'                            // action=sit,seat=1
            || !this.ready && 'be-ready'                            // action=ready
            || 'use-service'                                        // onTableReady
    }

    /** The name is unique and a registration feature can be added to the TODO list */
    get name(): string { return this.terminal?.input.name }                 // alex

    get service(): Service { return TableServiceHost.services.find(s => s.name === this.terminal?.input?.service) }

    get tables() {
        const item = this.terminal.history.filter((h, i) => (h.message || '').startsWith('{"tables":')).pop();
        return item && JSON.parse(item!.message).tables;
    }

    get lounge() {
        const item = this.terminal.history.filter((h, i) => (h.message || '').startsWith('{"lounge":')).pop();
        return item && JSON.parse(item!.message).lounge;
    }

    get serviceState() {
        const started = this.terminal.history.filter(i => /^serviceInstance has started/.test(i.message)).pop();
        const stopped = this.terminal.history.filter(i => /^serviceInstance (has stopped|was aborted)/.test(i.message)).pop();
        const item = this.terminal.history.filter((h, i) => (h.message || '').startsWith('{"state":')).pop();
        return item
            && this.terminal.history.indexOf(started) > this.terminal.history.indexOf(stopped)
            && this.terminal.history.indexOf(item) > this.terminal.history.indexOf(started)
            && JSON.parse(item!.message).state;
    }

    get table(): Table {
        if (this.terminal) {
            const service = this.terminal.inputIndexes.service;
            const left = this.terminal.history.filter(i => i.options?.name === 'action' && i.options.resolved === 'leave-table').pop();
            const joined = this.terminal.history.filter(i => i.options?.name === 'table' && parseInt(i.options.resolved) > 0).pop();
            return this.terminal.history.indexOf(joined) > service
                && this.terminal.history.indexOf(joined) > this.terminal.history.indexOf(left)
                && (this.service?.tables[(joined.options.resolved) - 1] || joined.options.resolved);
        } else {
            return null;
        }
    }

    get seat(): Seat | null {
        const left = this.terminal.history.filter(item => item.options?.resolved === 'leave-table').pop();
        const standing = this.terminal.history.filter(i => i.options?.name === 'action' && i.options.resolved === 'stand').pop();
        const sitting = this.terminal.history.filter(i => i.options?.name === 'seat' && (i.options.resolved) >= 1).pop();
        const seat = sitting && this.table && (this.table?.seats && this.table.seats[(sitting.options.resolved) - 1] || sitting.options.resolved);
        const joined = this.terminal.history.filter(i => i.options?.name === 'table' && (i.options.resolved) >= 1).pop();
        return this.table
            && this.terminal.history.indexOf(joined) > this.terminal.history.indexOf(left)
            && this.terminal.history.indexOf(sitting) > this.terminal.history.indexOf(joined)
            && this.terminal.history.indexOf(sitting) > this.terminal.history.indexOf(standing)
            && seat
    }

    get results() {
        return !this.ready && this.terminal.history.map(item => /serviceInstance has stopped: (.+)/.exec(item.message)).filter(Boolean).slice(-1).map(i => JSON.parse(i[1])).pop();
    }

    get ready() {
        const sitting = this.seat && this.terminal.history.filter(i => i.options?.name === 'seat' && (i.options.resolved) >= 1).pop();
        const ready = sitting && this.terminal.history.filter(i => i.options?.name === 'action' && i.options.resolved === 'ready').pop();
        const finished = this.terminal.history.filter(item => /serviceInstance (?:was aborted|has stopped)/.test(item.message)).pop();
        return this.terminal.history.indexOf(ready) > this.terminal.history.indexOf(sitting)
            && this.terminal.history.indexOf(ready) > this.terminal.history.indexOf(finished)
    }

    /** Has this agent(on behalf of terminal) invited a robot to certain seat? */
    invitedRobot(seat: number) {
        const booted = this.terminal.history.filter(item => item.type === 'prompt' && item.options.name === 'robot' && item.options.resolved === seat && item.options.message.includes('boot robot')).pop();
        const invited = this.terminal.history.filter(item => item.type === 'prompt' && item.options.name === 'robot' && item.options.resolved === seat && item.options.message.includes('invite robot')).pop();
        const joined = this.terminal.history.filter(i => i.options?.name === 'table' && (i.options.resolved) >= 1).pop();
        return this.terminal.history.indexOf(invited) > this.terminal.history.indexOf(booted)
            && this.terminal.history.indexOf(invited) > this.terminal.history.indexOf(joined);
    }

    getAgent = name => TableServiceHost.agents.find(a => a !== this && a.terminal.input.name === name);

    user: User;

    get choices() {
        return [
            { title: 'pause', value: 'pause', disabled: false },
            { title: 'leave-service', value: 'leave-service', disabled: !this.service },
            { title: 'ready', value: 'ready', disabled: !this.seat || this.ready },
            { title: `sit (${this.seat?.index})`, value: 'sit', disabled: !!this.seat || !this.table || this.table.seats.every(s => s.occupied) },
            { title: 'stand', value: 'stand', disabled: !this.seat },
            { title: `join-table (${this.table?.index})`, value: 'join-table', disabled: !!this.table },
            { title: 'invite-robot', value: 'invite-robot', disabled: !this.table || this.table.full },
            { title: 'boot-robot', value: 'boot-robot', disabled: !this.table?.seats?.some(s => s.robot) },
            { title: 'leave-table', value: 'leave-table', disabled: !this.table || !!this.seat },
            { title: 'respond-to-service-terminal', value: 'respond-to-service-terminal', disabled: false },
            { title: 'send-chat-lounge', value: 'send-chat-lounge', disabled: !this.service },
            { title: 'send-chat-table', value: 'send-chat-table', disabled: !this.table },
            ...'refresh quit'
                .split(' ')
                .map(v => ({ title: v, value: v }))
        ];
    }
    /** Run the service with a single terminal : Assist them in running getting a service running ( join a table, seat, start service, finish service, repeat )
     * Welcome, name, service, action=(join-table,sit,ready,invite-robot,boot-robot,stand,leave-table) */
    async run(dao: DAO) {
        // console.log('running table service');

        if (!this.terminal.history.find(i => /welcome to table service/.test(i.message)))
            await this.terminal.send('welcome to table service');

        // console.log('running table service2');

        const login = async () => {
            while (!this.terminal.input.name || this.getAgent(this.terminal.input.name)) {
                await this.terminal.prompt({
                    clobber: true,
                    type: 'text',
                    name: 'name',
                    initial: 'alex',
                    message: this.terminal.input.name
                        ? `the name "${this.terminal.input.name}" is being used by another person, please choose another name`
                        : 'what is your name',
                });
            }
            this.user = await dao.get(User, this.terminal.input.name) || await dao.create(User, <any>{ id: this.terminal.input.name, name: this.terminal.input.name });
        }; await login();

        // console.log('running table service3', this.terminal.input.name);

        const selectService = async () => {
            while (!TableServiceHost.services.map(s => s.name).includes(this.terminal.input.service)) {
                await this.terminal.prompt({
                    clobber: true,
                    type: 'select',
                    name: 'service',
                    message: this.terminal.input.service ? `${this.terminal.input.service} is invalid, which service?` : 'which service',
                    choices: TableServiceHost.services.map(s => ({ title: s.name, value: s.name }))
                });
            }
            this.user.rating(this.service.name);
        }; await selectService();

        // console.log('running table service4', this.terminal.input.service);

        while (this.terminal.input.action !== 'quit') {
            const { seat, table } = this;
            const { name } = this;
            const { serviceInstance, ready: wasRunning } = table || {};
            const { position } = seat || {};
            const handlers = {
                'quit': async () => {
                    await this.terminal.send('finished');
                    this.terminal.finished = new Date;
                },
                'join-table': async () => {
                    await this.terminal.prompt({
                        type: 'select',
                        name: 'table',
                        message: 'which table',
                        choices: this
                            .service
                            .tables
                            .map(({ id: v }, index) => ({ title: v, value: index + 1 }))
                    });
                },
                'leave-service': async () => {
                    await (this.terminal as Model).update$({ history: [...this.terminal.history, { type: 'prompt', options: { name: 'service', resolved: '' } }] });
                    await selectService();
                },
                'sit': async () => {
                    await this.terminal.prompt({
                        type: 'select',
                        name: 'seat',
                        message: 'which seat',
                        choices: this.table.seats.map(({ occupied }, index) => ({
                            disabled: occupied,
                            title: `seat ${index + 1}`,
                            value: index + 1
                        }))
                    });
                },
                'stand': async () => {
                    if (wasRunning && !this.table.ready) {
                        await this.table.abort(`${name} (#${position}) stood up`);
                        await this.terminal.send('serviceInstance was aborted (you-stood-up)');
                    }
                },
                'leave-table': async () => { },
                'refresh': async () => { },
                'ready': async () => { },
                'invite-robot': async () => {
                    await this.terminal.prompt({
                        type: 'select',
                        name: 'robot',
                        message: 'invite robot to which seat',
                        choices: this.table.seats.map(({ occupied }, index) => ({
                            disabled: occupied,
                            title: `seat ${index + 1}`,
                            value: index + 1
                        }))
                    });
                },
                'boot-robot': async () => {
                    await this.terminal.prompt({
                        type: 'select',
                        name: 'robot',
                        message: 'boot robot from which seat',
                        choices: this.table.seats.map(({ occupied, robot }, index) => ({
                            disabled: !robot,
                            title: `seat ${index + 1}`,
                            value: index + 1
                        }))
                    });
                },
                pause: () => Util.pause(10000),
                'send-chat-lounge': async () => {
                    const message = await this.terminal.prompt({ type: 'text', name: 'message', message: 'message:' });
                    await this.service.broadcast(`${this.name} says to the lounge: ${message}`)
                },
                'send-chat-table': async () => {
                    const message = await this.terminal.prompt({ type: 'text', name: 'message', message: 'message:' });
                    this.table.broadcast(`${this.name} says to the table: ${message}`);
                },
            };

            const { choices } = this;
            // console.log('going to get the action...', choices)
            const choice = await this
                .terminal.prompt({
                    clobber: true,
                    type: 'select',
                    name: 'action',
                    message: 'what action',
                    choices
                });
            // console.log('/going to get the action...', choice)

            if (!handlers[choice]) console.log('no handler for choice', choice);
            else if ((choices as any).find(c => c.value === choice).disabled) console.log('choice is disabled', choice)
            else await handlers[choice]().catch(error => {
                console.error('could not run choice!!', error);
                throw error;
            });

            // console.log('running table service6', this.terminal.input.name);

            await this.terminal.send(`state: ${this.state}`);

        }

    }
}

// AutoCreate table services