import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Terminal, ServiceCenter, TestingServices, ServiceCenterClient } from '@hawryschuk-terminal-restapi';
import { ServiceCenterComponent } from 'src/app/service-center/service-center.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ServiceCenterComponent],
  providers: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  terminal = new Terminal;
  terminals = [this.terminal];
  serviceCenter = new ServiceCenter().register(TestingServices.BrowniePoints, TestingServices.GuessingGame);
  get client() { return ServiceCenterClient.getInstance(this.terminal); }
  constructor() {
    // this.terminal.answer({ name: 'joe', service: 'Guessing Game', menu: ['Create Table', 'Sit', 'Ready'], seats: 1, guess: 1 });
  }
}
