import { catchError, debounceTime, filter, map, reduce, startWith, switchMap, take, tap } from 'rxjs/operators';
import { Observable, of, interval, combineLatest, BehaviorSubject } from 'rxjs';
import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import {  WebTerminal } from '@hawryschuk-terminal-restapi';

@Component({
  selector: 'app-table-service',
  templateUrl: './table-service.component.html',
  styleUrls: ['./table-service.component.scss']
})
export class TableServiceComponent implements OnInit {
  constructor(
    public cd: ChangeDetectorRef,
    // public api: ApiService
  ) {
    (window as any).tableService = this;
    (window as any).take = take;
  }

  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;
  scrollTop$ = new BehaviorSubject<number>(0);
  scrollToBottom() {
    this.scrollTop$.next(this.myScrollContainer.nativeElement.scrollHeight);
    this.cd.markForCheck();
    this.cd.detectChanges();
  }

  async ngOnInit() {
    // await (await api.terminal).answer({
    //   name: ['alex'],
    //   service: ['spades'],
    //   action: [
    //     'list-tables', 'join-table',
    //     'list-tables', 'sit',
    //     'list-tables', 'ready',
    //     'list-tables', 'send-chat-lounge',
    //     'list-tables', 'send-chat-table',
    //     'list-tables', 'invite-robot',
    //     'list-tables', 'invite-robot',
    //     'list-tables', 'invite-robot',
    //     'list-tables'
    //   ],
    //   message: ['hello lounge!', 'hello table!'],
    //   table: [1],
    //   seat: [1],
    //   robot: [2, 3, 4]
    // });

    /** Pausable terminal :: Is when the terminal has been prompted to be paused for over 5 seconds to be automatically responded to */

  }

  /** Html :: Query :: Whether i am an observer at the given table */
  amObserver(terminal: WebTerminal, table: { members: { ready: boolean; name: string; seat: number; }[] }) { return table.members.find(m => m.name === terminal.input.name) }

  /** Html :: Query :: Whether the given seat is occupied at the given table */
  memberAtSeat(table: { members: { ready: boolean; robot: boolean; name: string; seat: number; }[] }, seat: number) {
    return table.members.find(member => member.seat == seat)
  }

  /** Html :: Command :: WebTerminal::Action-Responses */
  leaveService = () => this.api.load({ title: 'leave-service', block: () => this.api.terminal.then(t => t.answer({ action: ['leave-service'] })) });
  onLeaveTableClick = () => this.api.load({ title: 'onLeaveTableClick', block: () => this.api.terminal.then(t => t.answer({ action: ['stand', 'leave-table'] })) });
  onReadyClick = () => this.api.load({ waitForStdout: false, title: 'onReadyClick', block: () => this.api.terminal.then(t => t.answer({ action: 'ready' })) });
  onJoinTableClick = (table: number) => this.api.load({ title: 'onJoinTableClick', block: () => this.api.terminal.then(t => t.answer({ action: ['join-table'], table })) });
  leaveTable = () => this.api.load({ title: 'leaveTable', block: () => this.api.terminal.then(t => t.answer({ action: ['stand', 'leave-table'] })) });
  inviteRobot = (seat = 0) => this.api.load({ title: 'inviteRobot', block: () => this.api.terminal.then(t => t.answer({ action: 'invite-robot', robot: seat })) });
  bootRobot = (seat = 0) => this.api.load({ title: 'bootRobot', block: () => this.api.terminal.then(t => t.answer({ action: 'boot-robot', robot: seat })) });
  chatTable = (message: string) => this.api.load({ title: 'chatTable', block: () => this.api.terminal.then(t => t.answer({ action: ['send-chat-table'], message })) });
  chatLounge = (message: string) => this.api.load({ title: 'chatLounge', block: () => this.api.terminal.then(t => t.answer({ action: ['send-chat-lounge'], message })) });
  stand = () => this.api.load({ title: 'stand', block: () => this.api.terminal.then(t => t.answer({ action: ['stand'] })) });
  setService = (value: any) => this.api.load({ title: 'set-service', block: () => this.api.terminal.then(terminal => terminal.answer({ service: value })) });
  setName = (value: any) => this.api.load({ title: 'set-name', block: () => this.api.terminal.then(terminal => terminal.answer({ name: value })) });
  joinTable = (_table, seat = 0) => this.api.load({
    title: 'joinTable',
    block: () => Promise.all([this.api.terminal, this.table$.pipe(take(1)).toPromise()])
      .then(([terminal, table]) => terminal.answer({
        action: [...(table ? [] : ['join-table']), 'sit'],
        ...(table ? {} : { table: _table }),
        seat
      }))
  });

  tableService$: Observable<TableService> = this.api.terminal$.pipe(switchMap(terminal => (((terminal as any)?.updated$ || of(null)) as Observable<any>).pipe(map(() =>
    <any>(terminal && new TableService(terminal))
  )))).pipe(tap(ts => { (window as any).ts = ts; }));

  canReady$ = this.api.terminal$.pipe(switchMap(terminal => ((terminal as any)?.updated$ || of(null)).pipe(map(() =>
    terminal && terminal.promptedFor({ name: 'action', value: 'ready' })
  ))));

  table$: Observable<number> = this.tableService$.pipe(map((t: any) => t && t.table));

  seat$: Observable<number> = this.tableService$.pipe(map((t: any) => t && t.seat));

  tables$ = this.tableService$.pipe(map(ts => ts && ts.tables));

  seatNumbers$ = this.tables$.pipe(map(tables => new Array(tables?.length ? tables[0].seats : 0).fill(0).map((_, i) => i + 1)));

  loungeChat$ = this.api.terminal$.pipe(switchMap(terminal => ((terminal as any)?.updated$ || of(null)).pipe(map(() =>
    (terminal?.history || [])
      .map(i => /^(.+) says to the lounge: (.+)$/.exec((i.message || '')))
      .filter(Boolean)
      .map(([, name, message]) => ({ name, message }))
  ))));

  tableChat$ = this.api.terminal$.pipe(switchMap(terminal => ((terminal as any)?.updated$ || of(null)).pipe(map(() =>
    (terminal?.history || [])
      .map(i => /^(.+) says to the table: (.+)$/.exec((i.message || '')))
      .filter(Boolean)
      .map(([, name, message]) => ({ name, message }))
  ))));

  game$: Observable<any> = this.api.terminal$.pipe(switchMap(terminal => ((terminal as any)?.updated$ || of(null)).pipe(map(() => {
    if (terminal) {
      const started = terminal.history.indexOf(terminal.history.filter(i => /^serviceInstance has started/.test(i.message)).pop());
      const finished = terminal.history.indexOf(terminal.history.filter(i => /^serviceInstance (?:has stopped|was aborted)/.test(i.message)).pop());
      const ready = terminal.history.indexOf(terminal.history.filter(i => i.options?.resolved == 'ready').pop());
      const standup = terminal.history.indexOf(terminal.history.filter(i => i.options?.resolved == 'stand').pop());
      const { tables = [] } = new TableService(terminal);
      const table: { seats: number; members: {}[]; ready: boolean; empty: boolean; } = tables[parseInt(terminal.input.table || '0') - 1];
      const playing = table?.ready && [finished, ready, standup].every(i => started > i) // && (bidprompt > started || bids > started);
      const terminals = new Array(table?.seats || 0).fill(0).map((_, i) => (i + 1) === terminal.input.seat ? terminal : new VacantTerminal());
      if (!Object.values({ TelefunkenGame, SpadesGame, StockTickerGame }).every(Boolean)) {
        const x = { TelefunkenGame, SpadesGame, StockTickerGame };
        console.log({ x })
        debugger;
      }
      const game = playing && (
        terminal.input.service === 'spades' && new SpadesGame({ terminals, history: terminal.history.slice(0) })
        || terminal.input.service === 'stock ticker' && new StockTickerGame({ terminals })
        || terminal.input.service === 'telefunken' && new TelefunkenGame({ terminals, history: terminal.history.slice(0) })
      );
      console.log({
        started, finished, ready, standup, terminal,
        // bids, bidprompt,
        tables,
        terminals: terminals.filter(t => !(t instanceof VacantTerminal)).length,
        table,
        playing,
        historyLength: terminal.history.length,
        history: terminal.history.slice(started),
        game
      });
      return game;
    } else {
      return null;
    }
  }))));

  vars$ = combineLatest([
    this.api.terminal$,
    this.loungeChat$,
    this.seat$,
    this.canReady$,
    this.api.service$,
    this.table$,
    this.tables$,
    this.game$,
    this.tableService$,
    this.seatNumbers$,
  ].map(o => o.pipe(
    startWith(null),
    catchError(async e => {
      console.error(e);
      return null;
    }))))
    .pipe(map(([
      terminal, loungeChat, seat, canReady, service, table, tables, game, tableService, seatNumbers
    ]) => ({
      terminal, loungeChat, seat, canReady, service, table, tables, game, tableService, seatNumbers,

      historyLength: terminal?.history?.length,
      history: terminal?.history,
    })))
    .pipe(catchError(async e => {
      console.error(e);
      return {} as any;
    }))
    .pipe(tap(vars => console.log({ vars })))

}
