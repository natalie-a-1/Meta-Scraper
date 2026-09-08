import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createAuthenticator, requireScope } from '../server/auth.js';
import { authenticateMerchant, demoMerchant, hash, type Config } from '../server/config.js';

test('OAuth verifies signature, expiry, issuer, audience, subject and permissions', async (t) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const config: Config = {
    mode: 'test',
    port: 4242,
    baseUrl: 'https://pay.example',
    databasePath: ':memory:',
    checkoutEnabled: true,
    merchants: [demoMerchant],
    issuer: 'https://identity.example',
    jwksUrl: `http://127.0.0.1:${address.port}`,
    audience: 'https://pay.example/mcp',
  };
  const auth = createAuthenticator(config);
  const token = (claims: Record<string, unknown> = {}) =>
    new SignJWT({ sub: 'customer-1', scope: 'payments:read', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setIssuer('https://identity.example')
      .setAudience('https://pay.example/mcp')
      .setExpirationTime('5m')
      .sign(privateKey);
  const identity = await auth(`Bearer ${await token()}`);
  assert.equal(identity.subject, 'customer-1');
  requireScope(identity, 'payments:read');
  assert.throws(() => requireScope(identity, 'payments:pay'), { code: 'forbidden' });
  await assert.rejects(auth(), { code: 'unauthorized' });
  await assert.rejects(auth(`Bearer ${await token({ scope: undefined })}`), {
    code: 'unauthorized',
  });
  await assert.rejects(auth(`Bearer ${await token({ sub: '' })}`), { code: 'unauthorized' });
  for (const fields of [
    { iss: 'https://attacker.example' },
    { aud: 'https://other.example' },
    { exp: 1 },
  ]) {
    const bad = await new SignJWT({
      sub: 'customer-1',
      scope: 'payments:read',
      iss: config.issuer,
      aud: config.audience,
      exp: Math.floor(Date.now() / 1000) + 300,
      ...fields,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .sign(privateKey);
    await assert.rejects(auth(`Bearer ${bad}`), { code: 'unauthorized' });
  }
});

test('merchant keys are distinct from user OAuth identities and empty credentials fail', () => {
  const key = 'merchant-test-secret-at-least-32-chars';
  const config: Config = {
    mode: 'test',
    port: 4242,
    baseUrl: 'https://pay.example',
    databasePath: ':memory:',
    checkoutEnabled: true,
    merchants: [{ ...demoMerchant, api_key_sha256: hash(key) }],
  };
  assert.equal(authenticateMerchant(`Bearer ${key}`, config).id, demoMerchant.id);
  for (const header of [undefined, '', 'Bearer ', 'Bearer bad', 'Bearer demo-merchant-key'])
    assert.throws(() => authenticateMerchant(header, config), { code: 'unauthorized' });
});
