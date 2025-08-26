import { Buffer } from 'buffer'; (globalThis as any).Buffer = Buffer;

export const FakeProcess = (globalThis as any).process = {
  env: {},
  argv: [],
  exit: (code = 0) => console.log(`Fake process exited with code ${code}`),
  cwd: () => '/',
  nextTick: (callback: Function) => setTimeout(callback, 0),
  on: (...args: any[]) => { },
};


import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
