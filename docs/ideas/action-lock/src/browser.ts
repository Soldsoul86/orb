// Entry for the self-contained phone build: runs the lock inside the page,
// with the same interface the page otherwise reaches over HTTP.
import { createDemo, type Verb } from './demo.ts';

const demo = createDemo();
setInterval(() => void demo.tick(), 200);

// Open in a working state: two sample held actions.
void demo.submit('onCall');
void demo.submit('bigNewPayee');

const withView = <T extends object>(result: T) => ({ ...demo.view(), result });

(globalThis as Record<string, unknown>)['ActionLockLocal'] = {
  state: async () => demo.view(),
  submit: async (preset: string) => withView(await demo.submit(preset)),
  act: async (id: string, verb: Verb) => withView(await demo.act(id, verb)),
  policy: async (change: 'loosen' | 'tighten') => withView(demo.changePolicy(change)),
};
