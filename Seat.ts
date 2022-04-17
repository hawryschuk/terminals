import { Terminal } from './Terminal';
import { Table } from './Table';
import { TableService } from './TableService';
import { WebTerminal } from './WebTerminal';

/** The seat is either: a) unoccopied, b) occuped by a robot, c) occupied by a table-service usher ( interfacing with a pending-connection|connected remote-terminal ) */
export class Seat {
    constructor(public table: Table) { }
    get index() { return this.table.seats.indexOf(this) }
    get position() { return 1 + this.index }
    get occupant(): TableService { return this.table.members.find(m => m.seat === this) }
    get terminal(): Terminal { return this.occupant?.terminal }
    get occupied() { return !!this.occupant || !!this.robot }
    get unoccupied() { return !this.occupied }
    get robot() { return !this.occupant && !!this.table.members.find(member => member.invitedRobot(this.position)) }
    get ready() { return this.occupant instanceof TableService ? this.occupant.ready : !!this.robot }
    get name() { return this.occupant?.name || (this.robot && `robot ${this.position}`) || null }
}
