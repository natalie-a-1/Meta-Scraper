import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CheckoutSession, PaymentMode, PaymentStatus, Receipt } from '../shared/contracts.js';
import { PaymentError } from './errors.js';

export interface StoredRequest {
  state_version: number;
  id: string;
  merchant_id: string;
  payer_subject: string;
  idempotency_key: string;
  fingerprint: string;
  session: CheckoutSession;
  mode: PaymentMode;
  status: PaymentStatus;
  processor_account?: string;
  expires_at: string;
  created_at: string;
  attempt: number;
  token_hash?: string;
  attempt_started_at?: string;
  provider_id?: string;
  receipt?: Receipt;
}

export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        document TEXT NOT NULL, UNIQUE(merchant_id, idempotency_key)
      );`);
  }
  close() {
    this.db.close();
  }
  get(id: string): StoredRequest {
    const row = this.db.prepare('SELECT document FROM requests WHERE id = ?').get(id) as
      { document: string } | undefined;
    if (!row) throw new PaymentError('not_found', 'Payment request not found.', 404);
    return JSON.parse(row.document) as StoredRequest;
  }
  insert(request: StoredRequest): StoredRequest {
    return this.transaction(() => {
      const old = this.db
        .prepare('SELECT document FROM requests WHERE merchant_id = ? AND idempotency_key = ?')
        .get(request.merchant_id, request.idempotency_key) as { document: string } | undefined;
      if (old) {
        const existing = JSON.parse(old.document) as StoredRequest;
        if (existing.fingerprint !== request.fingerprint)
          throw new PaymentError(
            'idempotency_conflict',
            'This idempotency key was already used for a different request.',
            409,
          );
        return existing;
      }
      this.db
        .prepare('INSERT INTO requests VALUES (?, ?, ?, ?)')
        .run(request.id, request.merchant_id, request.idempotency_key, JSON.stringify(request));
      return request;
    });
  }
  update(id: string, action: (request: StoredRequest) => void): StoredRequest {
    return this.transaction(() => {
      const request = this.get(id);
      const before = JSON.stringify(request);
      action(request);
      if (before === JSON.stringify(request)) return request;
      request.state_version += 1;
      this.db
        .prepare('UPDATE requests SET document = ? WHERE id = ?')
        .run(JSON.stringify(request), id);
      return request;
    });
  }
  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
