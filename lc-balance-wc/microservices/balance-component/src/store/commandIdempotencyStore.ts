import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import type { MakerExcessIdempotencyScope, MakerExcessSubmitResponse, MakerLegacySubmitResult } from '../service/makerExcessSubmitService';

interface CommandIdempotencyRow {
  request_hash: string;
  response_status: number;
  response_body: string;
}

type StoredCommandResponse = MakerExcessSubmitResponse | MakerLegacySubmitResult;

export type StoredIdempotencyDecision =
  Readonly<{ kind: 'MISS' }> | Readonly<{ kind: 'REPLAY'; response: StoredCommandResponse }> | Readonly<{ kind: 'CONFLICT' }>;

export class CommandIdempotencyStore {
  constructor(private readonly db: Db) {}

  resolve(scope: MakerExcessIdempotencyScope): StoredIdempotencyDecision {
    const row = this.db
      .prepare(
        `SELECT request_hash, response_status, response_body FROM command_idempotency
         WHERE command_type = ? AND owner_id = ? AND actor_context = ? AND idempotency_key = ?`,
      )
      .get(scope.commandType, scope.ownerId, scope.actorContext, scope.key) as CommandIdempotencyRow | undefined;
    if (!row) return { kind: 'MISS' };
    if (row.request_hash !== scope.requestHash) return { kind: 'CONFLICT' };
    const body = JSON.parse(row.response_body) as MakerExcessSubmitResponse['body'] | MakerLegacySubmitResult;
    return body && 'kind' in body
      ? { kind: 'REPLAY', response: body }
      : { kind: 'REPLAY', response: { httpStatus: row.response_status as 201, body: body as MakerExcessSubmitResponse['body'] } };
  }

  insert(scope: MakerExcessIdempotencyScope, response: StoredCommandResponse, createdAt: string): void {
    const responseBody = 'kind' in response ? response : response.body;
    this.db
      .prepare(
        `INSERT INTO command_idempotency (
          idempotency_record_id, command_type, owner_id, actor_context, idempotency_key,
          request_hash, response_status, response_body, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        scope.commandType,
        scope.ownerId,
        scope.actorContext,
        scope.key,
        scope.requestHash,
        'kind' in response ? 201 : response.httpStatus,
        JSON.stringify(responseBody),
        createdAt,
      );
  }
}
