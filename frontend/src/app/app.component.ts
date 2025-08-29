import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Terminal, ServiceCenter, TestingServices, ServiceCenterClient } from '@hawryschuk-terminal-restapi';
import { TerminalComponent } from '../terminal/terminal.component';
import { TableServiceComponent } from 'src/table-service/table-service.component';
import { Util } from '@hawryschuk-common/util';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TerminalComponent, TableServiceComponent, FormsModule],
  providers: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  terminal = new Terminal;
  client = ServiceCenterClient.getInstance(this.terminal);
  serviceCenter = new ServiceCenter().register(TestingServices.BrowniePoints, TestingServices.GuessingGame);

  guesses?: number[];
  ngOnInit() {
    Object.assign(window, this);
    // this.terminal.answer({ name: 'joe', service: 'Guessing Game', menu: ['Create Table', 'Sit', 'Ready'], seats: 1, guess: 1 });
    this.terminal.subscribe({
      handler: () => {
        this.guesses = this.terminal.prompts.guess
          ? Util.range(this.terminal.prompts.guess[0].min!, this.terminal.prompts.guess[0].max!)
          : undefined;
      }
    });
  }
}
