import { ChangeDetectorRef, Component, effect, ElementRef, input, Input, model, OnDestroy, OnInit, QueryList, signal, ViewChild, ViewChildren } from '@angular/core';
import { Util } from '@hawryschuk-common/util';
import { ServiceCenter, ServiceCenterClient, Terminal } from '@hawryschuk-terminal-restapi';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { ChatComponent } from '../chat/chat.component';
import { TerminalsComponent } from "../terminals/terminals.component";

@Component({
  selector: 'app-service-center',
  templateUrl: './service-center.component.html',
  styleUrls: ['./service-center.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ChatComponent, TerminalsComponent]
})
export class ServiceCenterComponent implements OnDestroy {
  constructor(public cd: ChangeDetectorRef) {
    Object.assign(window, { serviceCenterComponent: this });
    effect(() => localStorage.section = this.section());
    effect(() => this.sections().forEach(({ node, title }) => node.setAttribute('data-selected', `${this.section() === title}`)));
    effect(() => this.section.set(this.sections().at(-1)?.title), { allowSignalWrites: true });
    effect(() => this.sections().length && !Util.findWhere(this.sections(), { title: this.section() })
      && this.section.set(this.sections().at(-1)?.title)
      , { allowSignalWrites: true });
  }

  terminal = model.required<Terminal>();
  terminals = model<Terminal[]>([]);
  sections = signal<{ node: HTMLHeadingElement; title: string; }[]>([]);
  section = signal(localStorage.section);
  @ViewChildren('section') set sectionHeaders(refs: QueryList<ElementRef<HTMLHeadingElement>>) {
    this.sections.set(refs.map(({ nativeElement: node }) => ({ node, title: node.innerText })));
  }

  ngOnDestroy = (): void => { }

  get client() { return ServiceCenterClient.getInstance(this.terminal()); }

  get menu() { return this.client.Menu?.choices?.filter(c => !c.disabled).map(c => c.value) || []; }

  get status() {
    return this.connecting && 'connecting'
      || !this.connected && 'disconnected'
      || !this.terminal().input.Name && 'name-registration'
      || !this.terminal().input.service && 'service-selection'
      || !this.terminal().input.table && 'table-selection'
      || !this.terminal().input.seat && 'observing-table'
      || !this.terminal().input.ready && (this.client.ServiceInstance?.finished ? 'service-finished' : 'unready')
      || !this.client.Table?.started && 'waiting-for-players'
      || 'service-in-progress'
  }

  //#region Offline Mode
  @Input({ required: false }) serviceCenter?: ServiceCenter;
  private _connecting = false;
  get connected() { return !this.serviceCenter || this.serviceCenter.terminals.includes(this.terminal()); }
  get connecting() { return !this.connected && this._connecting; }
  set connecting(c: boolean) { this._connecting = c; }

  async connect(delay = 1000) {
    if (!this.connecting && !this.connected) {
      this.connecting = true;
      await Util.pause(delay);
      this.serviceCenter!.join(this.terminal());
    }
    //#endregion
  }
}
