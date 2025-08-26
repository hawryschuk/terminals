import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Terminal, ServiceCenter, TestingServices } from '@hawryschuk-terminal-restapi';
import { TerminalComponent } from '../terminal/terminal.component';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, TerminalComponent],
  providers: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  terminal = new Terminal;

  ngOnInit() {
    new ServiceCenter()
      .register(TestingServices.BrowniePoints, TestingServices.GuessingGame)
      .muteLounge()
      .join(this.terminal);
    Object.assign(window, this);
  }

}
