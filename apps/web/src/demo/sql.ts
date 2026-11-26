import type { PGlite } from '@electric-sql/pglite';
import type { Sql } from '@pulse/db/client';

/**
 * A small stand-in for the `postgres` tagged template, backed by PGlite.
 * It supports what the Pulse queries use: values become $n parameters and
 * nested sql`` fragments are inlined. Used only by the static demo.
 */
class Fragment implements PromiseLike<unknown[]> {
  constructor(
    readonly db: PGlite,
    readonly strings: TemplateStringsArray | string[],
    readonly values: unknown[],
  ) {}

  build(params: unknown[]): string {
    let text = '';
    this.strings.forEach((part, index) => {
      text += part;
      if (index >= this.values.length) return;
      const value = this.values[index];
      if (value instanceof Fragment) {
        text += value.build(params);
      } else {
        params.push(value instanceof Date ? value.toISOString() : value === undefined ? null : value);
        text += `$${params.length}`;
      }
    });
    return text;
  }

  async run(): Promise<unknown[]> {
    const params: unknown[] = [];
    const text = this.build(params);
    const result = await this.db.query(text, params);
    return result.rows as unknown[];
  }

  then<A = unknown[], B = never>(
    onfulfilled?: ((value: unknown[]) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export function createSql(db: PGlite): Sql {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => new Fragment(db, strings, values);
  // The demo runs one request at a time, so a transaction is just the callback.
  const begin = (work: (tx: unknown) => Promise<unknown>) => work(sql);
  return Object.assign(sql, { begin }) as unknown as Sql;
}
