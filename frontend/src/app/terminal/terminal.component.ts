import { ChangeDetectorRef, Component, computed, effect, ElementRef, input, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Util } from '@hawryschuk-common/util';
import { BehaviorSubject } from 'rxjs';
import { Terminal } from '@hawryschuk-terminal-restapi';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { onTerminalUpdated } from './onTerminalUpdated';

@Component({
  selector: 'app-terminal',
  templateUrl: './terminal.component.html',
  styleUrls: ['./terminal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TerminalComponent {
  @ViewChild('container') private container!: ElementRef;
  terminal = input.required<Terminal>();
  lines: Terminal['buffer'] = [];

  constructor(public cd: ChangeDetectorRef) {
    onTerminalUpdated({
      component: this,
      terminal: this.terminal,
      handler: async () => {
        this.cd.markForCheck();
        this.cd.detectChanges();
        await Util.pause(5); // prevents the form from updating immediately , having an input selected/activeElement , and having an event from another form affect this one
        if (document.querySelector('.prompt input')) {
          const input = await Util.waitUntil(() => document.querySelector('.prompt input:not([disabled])')! as HTMLInputElement);
          input.focus();
          input.checked = true;
        }
        this.container.nativeElement.scrollTop = this.container.nativeElement.scrollHeight;
        this.lines = this.terminal().buffer;
      }
    })
  }

  Number = Number;

  respond(event: Event, name: string, value: any) {
    const inputs = Array.from(document.querySelectorAll('.prompt input:not([disabled])')) as HTMLInputElement[];
    const active = inputs.find(input => input === document.activeElement);
    const handle = [active, active?.form].includes(event.target as any);
    if (event instanceof PointerEvent || handle)
      Util.throttle({
        interval: 500,
        queue: 1,
        resource: 'terminal-respond',
        block: () => { return this.terminal().respond(value, name); }
      });
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }

}
