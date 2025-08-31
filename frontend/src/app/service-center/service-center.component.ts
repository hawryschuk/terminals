import { ChangeDetectorRef, Component, effect, ElementRef, Input, model, OnDestroy, QueryList, Signal, signal, ViewChildren } from '@angular/core';
import { Util } from '@hawryschuk-common/util';
import { ServiceCenter, ServiceCenterClient, Terminal } from '@hawryschuk-terminal-restapi';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatComponent } from '../chat/chat.component';
import { TerminalsComponent } from "../terminals/terminals.component";

export const onTerminalUpdated = ({ component, handler, terminal }: { component: any; handler: () => any; terminal: Signal<Terminal>; }) => {
  const terminalSubscriptions = new Map<Terminal, { unsubscribe: Function }>;
  const { ngOnDestroy } = component;
  component.ngOnDestroy = () => {
    [...terminalSubscriptions.values()].forEach(s => s.unsubscribe());
    ngOnDestroy?.();
  }
  effect(() => {
    if (terminal() && !terminalSubscriptions.has(terminal())) {
      terminalSubscriptions.set(terminal(), terminal().subscribe({ handler }));
    }
  });
};

@Component({
  selector: 'app-service-center',
  templateUrl: './service-center.component.html',
  styleUrls: ['./service-center.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, ChatComponent, TerminalsComponent]
})
export class ServiceCenterComponent {

  constructor(public cd: ChangeDetectorRef) {
    Object.assign(window, { serviceCenterComponent: this });

    /** Auto-select the first user that direct-messages the terminal */
    onTerminalUpdated({
      component: this,
      terminal: this.terminal,
      handler: () => this.selectedUser ||= Object.keys(this.client.Messages.Direct || {}).sort().shift()
    });
    effect(() => localStorage.section = this.section());
    effect(() => this.sections().forEach(({ node, title }) => node.setAttribute('data-selected', `${this.section() === title}`)));
    effect(() => {
      const last = this.sections().at(-1)?.title;
      const newaddition = !this.lastSections.includes(last!);
      const removed = !Util.findWhere(this.sections(), { title: this.section() });
      if ((newaddition || removed) && last) this.section.set(last);
      this.lastSections = this.sections().map(s => s.title);
    }, { allowSignalWrites: true });
  }

  lastSections: string[] = [];
  terminal = model.required<Terminal>();
  terminals = model<Terminal[]>([]);
  sections = signal<{ node: HTMLHeadingElement; title: string; }[]>([]);
  section = signal(localStorage.section);
  @ViewChildren('section') set sectionHeaders(refs: QueryList<ElementRef<HTMLHeadingElement>>) {
    this.sections.set(refs.map(({ nativeElement: node }) => ({ node, title: node.innerText })));
  }

  async initiateDirectMessaging(user?: string) {
    if (user && user !== this.client.UserName) {
      this.selectedUser = user;
      if (!Util.findWhere(this.client.Users.DirectMessaged, { name: user }))
        await this.client.Message.Direct({ to: user, message: ' ' });
      this.section.set('Direct Messages');
    }
  }

  selectedUser?: string;

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
