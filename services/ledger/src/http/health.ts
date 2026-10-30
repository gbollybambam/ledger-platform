import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export function registerHealthRoutes(app: FastifyInstance, pool: Pool): void {
  // Liveness: the process is up. It does not touch the database.
  app.get('/health', () => ({ status: 'ok' }));

  // Readiness: the process can reach the database.
  app.get('/health/ready', async (request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch (err) {
      request.log.error({ err }, 'readiness check failed');
      return reply.status(503).send({ status: 'unavailable', db: 'down' });
    }
  });
}
