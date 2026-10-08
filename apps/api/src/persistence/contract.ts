/** Minimal synchronous persistence contract shared by the existing Store. */
export type DatabaseValue = null | string | number | bigint | Uint8Array;
export type DatabaseRow = Record<string, unknown>;
export interface PersistenceStatement {
  all(...values: DatabaseValue[]): DatabaseRow[];
  get(...values: DatabaseValue[]): DatabaseRow | undefined;
  run(...values: DatabaseValue[]): { changes: number | bigint };
}
export interface PersistenceDatabase {
  exec(sql: string): void;
  prepare(sql: string): PersistenceStatement;
  close(): void;
}
