import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { runIdempotent } from '../idempotency/run-idempotent.js';
import { ApiError } from '../http/errors.js';
import { createAccount } from './service.js';
import { findAccount, getAccount } from './sql.js';
import {
  accountIdSchema,
  createAccountSchema,
  findAccountsSchema,
  type CreateAccountBody,
} from './schemas.js';

export function registerAccountRoutes(app: FastifyInstance, pool: Pool): void {
  app.post<{ Body: CreateAccountBody }>(
    '/v1/accounts',
    { config: { access: 'ledger:write' }, schema: createAccountSchema },
    async (request, reply) =>
      runIdempotent(request, reply, pool, async (tx) => ({
        status: 201,
        body: await createAccount(tx, request.client!.id, request.body),
      })),
  );

  app.get<{ Params: { id: string } }>(
    '/v1/accounts/:id',
    { config: { access: 'ledger:read' }, schema: accountIdSchema },
    async (request) => {
      const account = await getAccount(pool, request.params.id);
      if (account === undefined) {
        throw new ApiError(404, 'not_found', 'Account not found');
      }
      return account;
    },
  );

  app.get<{ Querystring: { external_id: string; client?: string } }>(
    '/v1/accounts',
    { config: { access: 'ledger:read' }, schema: findAccountsSchema },
    async (request) => {
      const account = await findAccount(
        pool,
        request.query.external_id,
        request.query.client ?? request.client!.name,
      );
      return { data: account === undefined ? [] : [account] };
    },
  );
}
