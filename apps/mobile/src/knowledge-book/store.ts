import { createSession, reducer, taipeiDay, type Action, type Session } from "./flow";
/** A route remount preserves same-day QA answers. Reload starts a new QA run. */
export function createQaStore(initial: Session) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispatch: (action: Action) => { const next = reducer(snapshot, action); if (next !== snapshot) { snapshot = next; listeners.forEach(listener => listener()); } },
  };
}
export const qaStore = createQaStore(createSession(taipeiDay(), 1));
