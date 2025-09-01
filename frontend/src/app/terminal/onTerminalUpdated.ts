import { Signal, effect } from '@angular/core';
import { Terminal } from '../../../../Terminal';


export const onTerminalUpdated = ({ component, handler, terminal }: { component: any; handler: () => any; terminal: Signal<Terminal>; }) => {
  const terminalSubscriptions = new Map<Terminal, { unsubscribe: Function; }>;
  const { ngOnDestroy } = component;
  component.ngOnDestroy = () => {
    [...terminalSubscriptions.values()].forEach(s => s.unsubscribe());
    ngOnDestroy?.();
  };
  effect(() => {
    if (terminal() && !terminalSubscriptions.has(terminal())) {
      terminalSubscriptions.set(terminal(), terminal().subscribe({ handler }));
    }
  });
};
