import '@testing-library/jest-dom';

import { beforeEach } from 'vitest';
import { setDemoOffline } from './demo/store.js';
beforeEach(() => { localStorage.clear(); setDemoOffline(false); });
