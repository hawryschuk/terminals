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
  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;
  @Input() terminal!: Terminal;
  Number = Number;

  constructor(public cd: ChangeDetectorRef) { }

  async respond(event: Event, name: string, value: any) {
    const inputs = Array.from(document.querySelectorAll('.prompt input:not([disabled])')) as HTMLInputElement[];
    const active = inputs.find(input => input === document.activeElement);
    const handle = [active, active?.form].includes(event.target as any);
    if (event instanceof PointerEvent || handle) {
      console.log('Respond to Form: ', { value, name, event, active, handle });
      await this.terminal.respond(value, name);
    } else if (!active) {
      console.log('ignore 1', { event, name, value, active });
      debugger;
    } else {
      console.log('ignore', { event, name, value, active });
      debugger;
    }
    // event.stopPropagation();
    // event.preventDefault();
    // return false;
  }

  scrollTop$ = new BehaviorSubject<number>(0);

  ngOnInit(): void {
    this.terminal.subscribe({
      handler: async () => {
        await Util.pause(100);
        this.cd.markForCheck();
        this.cd.detectChanges();
        this.scrollTop$.next(this.myScrollContainer.nativeElement.scrollHeight);
        if (document.querySelector('.prompt input')) {
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
