/** QA-only event explorer. Reads canonical registries; MUST NOT call API, ledger or grants. */
import data from "./flow-runtime.generated.json";

export type EventRecord = (typeof data.events)[number];
export type PathRecord = (typeof data.paths)[number];
export type TransitionRecord = (typeof data.transitions)[number];
export const FLOW_REGISTRY = data;
export const QA_FLOW_COUNTS = Object.freeze({
  paths: data.paths.length,
  events: data.events.length,
  transitions: data.transitions.length,
});

const eventsById = new Map<string, EventRecord>(data.events.map(e => [e.id,e]));
const pathsById = new Map<string, PathRecord>(data.paths.map(p => [p.id,p]));
const transitionsByEvent = new Map<string, TransitionRecord[]>();
for (const t of data.transitions) {
  const list=transitionsByEvent.get(t.event) ?? [];
  list.push(t);
  transitionsByEvent.set(t.event,list);
}

export function eventById(id: string) { return eventsById.get(id); }
export function pathById(id: string) { return pathsById.get(id); }
export function childrenOf(parent: string) {
  return data.paths.filter(p => p.parent === parent);
}
export function eventsForPath(pathId: string) {
  return data.events.filter(e => e.paths.includes(pathId));
}
export function transitionsForEvent(id: string) { return transitionsByEvent.get(id) ?? []; }

/** First unlock level is an advisory QA filter, NOT backend authorization.
 * Source strings can include ranges, arrows, and combined level descriptions. */
export function minimumQaLevel(rule: string): number {
  const m = rule.match(/Lv\.?\s*(\d+)/i) ?? rule.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : 1;
}
export function isWithinQaLevel(event: EventRecord, level: number) {
  return level >= minimumQaLevel(event.level);
}
export function startingVisualState(event: EventRecord) {
  const transitions=transitionsForEvent(event.id);
  if (transitions.some(t => t.from === event.start)) return event.start;
  return transitions[0]?.from ?? event.start;
}
export function choicesFrom(eventId: string, currentVisualState: string) {
  return transitionsForEvent(eventId).filter(t => t.from === currentVisualState);
}
/** Simulated visual transition only. No reward, CO2e, inventory, identity, network or persistence. */
export function qaAdvance(eventId: string, currentVisualState: string, transitionId: string) {
  const choice=choicesFrom(eventId,currentVisualState).find(t => t.id === transitionId);
  return choice ? {nextVisualState:choice.to,transitionId:choice.id} : null;
}
export function registryDiagnostics() {
  const eventIds=new Set(data.events.map(e=>e.id));
  const pathIds=new Set(data.paths.map(p=>p.id));
  return {
    duplicateEvents: data.events.filter((e,i)=>data.events.findIndex(x=>x.id===e.id)!==i).map(e=>e.id),
    unknownTransitionEvents: data.transitions.filter(t=>!eventIds.has(t.event)).map(t=>t.id),
    missingPathParents: data.paths.filter(p=>p.parent&&!pathIds.has(p.parent)).map(p=>p.id),
    missingEventPaths: data.events.flatMap(e=>e.paths.filter(p=>!pathIds.has(p)).map(p=>e.id+":"+p)),
    eventsWithoutTransitions: data.events.filter(e=>!transitionsByEvent.has(e.id)).map(e=>e.id)
  };
}
