import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Terminal, ServiceCenter, TestingServices, ServiceCenterClient } from '@hawryschuk-terminal-restapi';
import { TerminalComponent } from '../terminal/terminal.component';
import { TableServiceComponent } from 'src/table-service/table-service.component';
import { Util } from '@hawryschuk-common/util';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TerminalComponent, TableServiceComponent],
  providers: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  terminal = new Terminal;
  client = new ServiceCenterClient(this.terminal);

  ngOnInit() {
    Object.assign(window, this);
    this.terminal.subscribe({
      handler: () => {
        this.guesses = this.terminal.prompts.guess
          ? Util.range(this.terminal.prompts.guess[0].min!, this.terminal.prompts.guess[0].max!)
          : undefined;
      }
    });
  }

  guesses?: number[];
}
