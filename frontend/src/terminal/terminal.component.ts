import { ChangeDetectorRef, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { Util } from '@hawryschuk-common/util';
import { BehaviorSubject } from 'rxjs';
import { Terminal } from '@hawryschuk-terminal-restapi';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-terminal',
  templateUrl: './terminal.component.html',
  styleUrls: ['./terminal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class TerminalComponent implements OnInit {
  @ViewChild('container') private container!: ElementRef;
  @Input() terminal!: Terminal;
  Number = Number;

  constructor(public cd: ChangeDetectorRef) { }

  respond(event: Event, name: string, value: any) {
    const inputs = Array.from(document.querySelectorAll('.prompt input:not([disabled])')) as HTMLInputElement[];
    const active = inputs.find(input => input === document.activeElement);
    const handle = [active, active?.form].includes(event.target as any);
    console.log('handling event', { event, name, value, active, handle })
    if (event instanceof PointerEvent || handle)
      Util.throttle({
        interval: 500,
        queue: 1,
        resource: 'terminal-respond',
        block: () => {
          console.log('sending response', name, value);
          return this.terminal.respond(value, name);
        }
      });
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  }

  scrollTop$ = new BehaviorSubject<number>(0);

  ngOnInit(): void {
    this.terminal.subscribe({
      handler: async () => {
        this.cd.markForCheck();
        this.cd.detectChanges();
        this.scrollTop$.next(this.container.nativeElement.scrollHeight);
        if (document.querySelector('.prompt input')) {
          await Util.pause(150); // prevents the form from updating immediately , having an input selected/activeElement , and having an event from another form affect this one
          const input = await Util.waitUntil(() => document.querySelector('.prompt input:not([disabled])')! as HTMLInputElement);
          input.focus();
          input.checked = true;
        }
      }
    });
  }

  get promptMessage() {
    const { message } = this.terminal.prompted!;
    return typeof message == 'string' ? message : JSON.stringify(this.terminal.prompted)
  }

}
