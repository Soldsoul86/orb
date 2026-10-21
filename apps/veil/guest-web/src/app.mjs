import {renderGuest} from './view.mjs';
import {initialState} from './state.mjs';
import {capabilities} from './gate.mjs';
// No fetch, storage, clipboard, key generation or message logging until the gate is met.
renderGuest(document.querySelector('main'),{state:initialState(),available:capabilities.guestMessaging});
