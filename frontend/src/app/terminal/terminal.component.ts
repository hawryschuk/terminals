import { ChangeDetectorRef, Component, computed, effect, ElementRef, input, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Util } from '@hawryschuk-common/util';
import { BehaviorSubject } from 'rxjs';
import { Prompt, PromptIndex, Terminal, TerminalActivity, TO_STRING } from '@hawryschuk-terminal-restapi';
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
  Number = Number;
  @ViewChild('container') private container!: ElementRef;
  terminal = input.required<Terminal>();

  constructor(public cd: ChangeDetectorRef) {
    Object.assign(window, { terminal: this })
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
        console.log('updated!!')
        this.container.nativeElement.scrollTop = this.container.nativeElement.scrollHeight;
        // this.lines = this.terminal().buffer;
      }
    })
  }

  respond(event: Event, prompt: Prompt, value: any) {
    const inputs = Array.from(document.querySelectorAll('.prompt input:not([disabled])')) as HTMLInputElement[];
    const active = inputs.find(input => input === document.activeElement);
    const handle = [active, active?.form].includes(event.target as any);
    // const item = Util.findWhere(this.terminal().unansweredPrompts, { prompt })!;
    // const index = this.terminal().history.indexOf(item);
    if (prompt.type === 'multiselect') value ||= prompt.choices!.filter(c => c.selected).map(c => c.value);
    if (event instanceof PointerEvent || handle)
      Util.throttle({
        interval: 500,
        queue: 1,
        resource: 'terminal-respond',
        block: async () => await this.terminal().respond(value, prompt.name, prompt[PromptIndex]),
      });
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }

}
