import { Terminal } from './Terminal';
import { testTerminal } from 'Terminal.spec.exports';

describe('Terminal', () => {
    testTerminal(Promise.resolve(new Terminal));
});