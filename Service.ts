import { TableServiceHost } from './TableServiceHost';
import { Table } from './Table';


export class Service {
    name!: string;
    seats!: number;
    generateService!: Function; // when a service is generated, it goes into a new Table object in the serviceInstance property
    tables: Table[] = [];

    constructor({ name, seats, generateService } = {} as { name: string; seats: number; generateService: Function; }) {
        Object.assign(this, { name, seats, generateService });
    }

    async broadcast(message: any) { return await Promise.all(this.agents.map(agent => agent.terminal.send(message))); }

    get emptyTable() { return this.tables.find(table => table.empty); }

    get agents() { return TableServiceHost.agents.filter(a => a.terminal?.input?.service === this.name) }

    get lounge() {
        return this.agents.map(({ user, name, table, seat, ready = false }) => ({
            name,
            table: table ? table.index + 1 : 0,
            seat: seat ? seat.position : 0,
            rating: user!.rating(this.name),
            ready
        }))
    }

    get Tables() {
        return this.
            tables
            .map(table => ({
                seats: this.seats,
                empty: table.empty,
                ready: table.ready,
                members: [
                    ...table
                        .members
                        .map(m => ({
                            name: m.name,
                            seat: 1 + table.seats.indexOf(m.seat!),
                            ready: m.ready,
                        }))
                        .filter(m => !table.seats[m.seat - 1]?.robot),
                    ...table
                        .seats
                        .filter(seat => seat.robot)
                        .map((seat, index) => {
                            return {
                                seat: table.seats.indexOf(seat) + 1,
                                robot: true,
                                name: `robot ${index + 1}`
                            }
                        })
                ]
            }));
    }
}
