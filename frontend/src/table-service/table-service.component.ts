import { ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Util } from '@hawryschuk-common/util';
import { ServiceCenter, ServiceCenterClient, Terminal } from '@hawryschuk-terminal-restapi';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';

@Component({
  selector: 'app-table-service',
  templateUrl: './table-service.component.html',
  styleUrls: ['./table-service.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TableServiceComponent implements OnInit, OnDestroy {
  constructor(public cd: ChangeDetectorRef) {
    (window as any).tableService = this;
  }

  @Input({ required: true }) terminal!: Terminal;
  @ViewChild('container') private container!: ElementRef;
  scrollTop$ = new BehaviorSubject<number>(0);

  async ngOnInit() {
    // this.connect(0); //    this.terminal.answer({ name: 'joe', service: 'Guessing Game', menu: ['Create Table', 'Sit', 'Ready'], seats: 1, guess: 1 });

    /** Ubsubcribes from the terminal when the Component is destroyed */
    this.ngOnDestroy = this
      .terminal
      .subscribe({
        handler: async () => {
          const client = new ServiceCenterClient(this.terminal);
          Object.assign(this.Client, Util.pick(client, ['Menu', 'Messages', 'Users', 'ServiceStarted', 'ServiceEnded', 'Table']));
          this.cd.markForCheck();
          this.cd.detectChanges();
          this.scrollTop$.next(this.container?.nativeElement.scrollHeight);
        }
      })
      .unsubscribe;
  }

  get client() { return new ServiceCenterClient(this.terminal); }

  /** Cached Computed Terminal/Service State */
  Client: Partial<ServiceCenterClient> = {};

  get menu() { return this.Client.Menu?.choices?.filter(c => !c.disabled).map(c => c.value); }

  ngOnDestroy = (): void => { }

  get status() {
    return this.connecting && 'connecting'
      || !this.connected && 'disconnected'
      || !this.terminal.input.Name && 'name-registration'
      || !this.terminal.input.service && 'service-selection'
      || !this.terminal.input.table && 'table-selection'
      || !this.terminal.input.seat && 'observing-table'
      || !this.terminal.input.ready && 'unready'
      || !this.client.ServiceStarted && 'waiting-for-players'
      || 'service-in-progress'
  }

  //#region Offline Mode
  @Input({ required: false }) serviceCenter?: ServiceCenter;
  private _connected = false;
  private _connecting = false;
  set connected(c: boolean) { this._connected = true; }
  get connected() { return !this.serviceCenter || this._connected; }
  get connecting() { return !this.connected && this._connecting; }
  set connecting(c: boolean) { this._connecting = c; }

  async connect(delay = 1000) {
    if (!this.connecting && !this.connected) {
      this.connecting = true;
      await Util.pause(delay);
      this.serviceCenter!.join(this.terminal);
      this.connected = true;
    }
    this.connected = true;
    //#endregion
  }
}
