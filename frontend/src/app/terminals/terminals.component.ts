import { Component, input, model } from '@angular/core';
import { Terminal } from '../../../../Terminal';
import { CommonModule } from '@angular/common';
import { TerminalComponent } from '../terminal/terminal.component';

@Component({
  selector: 'app-terminals',
  standalone: true,
  imports: [CommonModule, TerminalComponent],
  templateUrl: './terminals.component.html',
  styleUrl: './terminals.component.scss'
})
export class TerminalsComponent {
  terminal = model.required<Terminal>();
  terminals = model.required<Terminal[]>();
  addTerminal() {
    this.terminal.set(new Terminal);
    this.terminals().push(this.terminal());
  }
}
