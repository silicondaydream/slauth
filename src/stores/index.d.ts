import type { Store } from '../index.js'
export function memory(): Store
export function d1(db: { prepare(sql: string): any }, options?: { table?: string }): Store
export function kv(namespace: { get(key: string, type: 'json'): Promise<any>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>; delete(key: string): Promise<void>; list?(options: { prefix: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }> }, options?: { prefix?: string }): Store
export function sqlite(db: { prepare(sql: string): { get(...args: unknown[]): any; run(...args: unknown[]): unknown; all?(...args: unknown[]): any[] } }, options?: { table?: string }): Store
