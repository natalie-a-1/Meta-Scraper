import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Config } from './config.js';
import { PaymentError } from './errors.js';

export interface Identity {
  subject: string;
  scopes: Set<string>;
}
export type Authenticate = (header?: string) => Promise<Identity>;
export function createAuthenticator(config: Config): Authenticate {
  if (config.mode === 'demo')
    return async () => ({
      subject: 'demo-user',
      scopes: new Set(['payments:read', 'payments:pay']),
    });
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl!));
  return async (header) => {
    if (!header?.startsWith('Bearer '))
      throw new PaymentError('unauthorized', 'Connect your Lucci Pay account to continue.', 401);
    try {
      const { payload } = await jwtVerify(header.slice(7), jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      if (!payload.sub || typeof payload.scope !== 'string') throw new Error('Invalid claims');
      return { subject: payload.sub, scopes: new Set(payload.scope.split(' ')) };
    } catch {
      throw new PaymentError('unauthorized', 'Reconnect your Lucci Pay account to continue.', 401);
    }
  };
}
export function requireScope(identity: Identity, scope: string) {
  if (!identity.scopes.has(scope))
    throw new PaymentError(
      'forbidden',
      'Your account connection does not have permission for this action.',
      403,
    );
}
