import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export function registerCurrencyRoutes(app: FastifyInstance, pool: Pool): void {
  app.get('/v1/currencies', { config: { access: 'ledger:read' } }, async () => {
    const result = await pool.query<{ code: string; minor_exponent: number }>(
      `SELECT code, minor_exponent FROM currencies ORDER BY code`,
    );
    return { data: result.rows };
  });
}
