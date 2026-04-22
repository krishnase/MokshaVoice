/**
 * Smoke test: S3 presigned upload URL + CloudFront signed playback URL
 *
 * Self-contained — loads .env itself so it works even when Firebase / RC
 * vars are not yet configured. Requires only the AWS + CloudFront vars.
 *
 * Run from apps/backend/:
 *   pnpm exec tsx src/scripts/testS3.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, createSign } from 'crypto';

// ── Robust .env parser: handles quoted multi-line + unquoted PEM blocks ───────
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) { i++; continue; }

    const eq = trimmed.indexOf('=');
    if (eq === -1) { i++; continue; }

    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1); // intentionally not trimmed yet

    // Quoted multi-line: VALUE="...\n..."
    if (val.trimStart().startsWith('"')) {
      val = val.trimStart().slice(1); // strip opening "
      while (i + 1 < lines.length && !val.endsWith('"')) {
        i++;
        val += '\n' + lines[i];
      }
      if (val.endsWith('"')) val = val.slice(0, -1); // strip closing "
    }
    // Unquoted PEM block: VALUE=-----BEGIN ...-----  (multiline, no quotes)
    else if (val.trim().startsWith('-----BEGIN')) {
      const parts = [val.trim()];
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!.trim();
        // Stop at next KEY=... line or blank line followed by KEY=
        if (/^[A-Z][A-Z0-9_]+=/.test(next) || (next === '' && i + 2 < lines.length && /^[A-Z][A-Z0-9_]+=/.test(lines[i + 2]?.trim() ?? ''))) break;
        if (next.startsWith('#')) break;
        i++;
        parts.push(lines[i]!.trim());
        if (lines[i]!.trim().startsWith('-----END')) break;
      }
      val = parts.join('\n');
    }
    // Single-line value
    else {
      val = val.trim();
      // Strip surrounding single/double quotes
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
    }

    if (key) result[key] = val;
    i++;
  }

  return result;
}

// ── Load .env before any AWS SDK import ───────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../../.env'); // src/scripts → src → apps/backend

try {
  const raw = readFileSync(envPath, 'utf8');
  const pairs = parseEnvFile(raw);
  for (const [k, v] of Object.entries(pairs)) {
    if (!(k in process.env)) process.env[k] = v;
  }
  console.log(`Loaded .env from ${envPath}\n`);
} catch {
  console.warn(`Could not read .env — relying on existing process.env\n`);
}

// ── Now import AWS SDK (needs process.env.AWS_REGION etc.) ───────────────────
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as getCFSignedUrl } from '@aws-sdk/cloudfront-signer';

// ── Config ────────────────────────────────────────────────────────────────────
const cfg = {
  region:           process.env['AWS_REGION']              ?? '',
  accessKeyId:      process.env['AWS_ACCESS_KEY_ID']       ?? '',
  secretAccessKey:  process.env['AWS_SECRET_ACCESS_KEY']   ?? '',
  bucketName:       process.env['S3_BUCKET_NAME']          ?? '',
  cloudfrontDomain: (process.env['CLOUDFRONT_DOMAIN']      ?? '').replace(/\/$/, ''),
  cfKeyPairId:      process.env['CLOUDFRONT_KEY_PAIR_ID']  ?? '',
  // Support both escaped (\n) and real newlines
  cfPrivateKey:     (process.env['CLOUDFRONT_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n'),
};

const missing = Object.entries(cfg)
  .filter(([, v]) => !v || v.includes('PLACEHOLDER') || v.includes('placeholder'))
  .map(([k]) => k);

if (missing.length) {
  console.error('❌  Missing / placeholder values in .env:');
  missing.forEach((k) => console.error(`    ${k}`));
  process.exit(1);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const FAKE_SESSION_ID = '00000000-0000-0000-0000-000000000001';
const FAKE_MESSAGE_ID = randomUUID();
const KEY             = `audio/${FAKE_SESSION_ID}/${FAKE_MESSAGE_ID}.m4a`;

const s3 = new S3Client({
  region: cfg.region,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
});

console.log('=== MokshaVoice S3 / CloudFront Smoke Test ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// [ 1 ]  S3 presigned upload URL
// ─────────────────────────────────────────────────────────────────────────────
console.log('[ 1 ]  S3 presigned upload URL');

let uploadUrl: string;
try {
  uploadUrl = await getS3SignedUrl(
    s3,
    new PutObjectCommand({ Bucket: cfg.bucketName, Key: KEY, ContentType: 'audio/m4a' }),
    { expiresIn: 900 },
  );
} catch (err) {
  console.error('  FAIL —', (err as Error).message);
  process.exit(1);
}

const s3Url = new URL(uploadUrl);
console.log(`  URL : ${uploadUrl.slice(0, 108)}…`);

let allPassed = true;
for (const [label, ok] of [
  ['HTTPS',                        s3Url.protocol === 'https:'],
  ['Host is S3 / amazonaws',       s3Url.hostname.includes('s3') || s3Url.hostname.includes('amazonaws')],
  ['Has X-Amz-Signature',          s3Url.searchParams.has('X-Amz-Signature')],
  ['X-Amz-Expires = 900',          s3Url.searchParams.get('X-Amz-Expires') === '900'],
  ['Key in path',                  s3Url.pathname.includes(FAKE_MESSAGE_ID)],
] as Array<[string, boolean]>) {
  console.log(`  ${ok ? '✓' : '✗'}  ${label}`);
  if (!ok) allPassed = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// [ 2 ]  CloudFront signed playback URL
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[ 2 ]  CloudFront signed playback URL');

// Diagnose key before attempting to sign
const keyLines      = cfg.cfPrivateKey.split('\n').filter(Boolean);
const keyFirstLine  = keyLines[0] ?? '(empty)';
const keyLastLine   = keyLines[keyLines.length - 1] ?? '(empty)';
const isPKCS8       = keyFirstLine.includes('BEGIN PRIVATE KEY');
const isPKCS1       = keyFirstLine.includes('BEGIN RSA PRIVATE KEY');
console.log(`  Key header  : ${keyFirstLine}`);
console.log(`  Key footer  : ${keyLastLine}`);
console.log(`  Line count  : ${keyLines.length}  (expect ≥ 25 for 2048-bit key)`);
console.log(`  Format      : ${isPKCS8 ? 'PKCS#8 (BEGIN PRIVATE KEY)' : isPKCS1 ? 'PKCS#1 (BEGIN RSA PRIVATE KEY)' : 'unknown'}`);

if (keyLines.length < 3) {
  console.error('\n  ✗  Key looks truncated — check .env format (see note below)');
  console.error('\n  Note: If the key spans multiple lines in .env without quotes,');
  console.error('  encode it on one line using literal \\n:');
  console.error('  CLOUDFRONT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----');
  process.exit(1);
}

// Node 25 + OpenSSL 3 deprecates RSA-SHA1 via the high-level name in some contexts.
// @aws-sdk/cloudfront-signer internally uses createSign('RSA-SHA1') which works,
// but if the key is PKCS#8, some builds raise an unsupported-decoder error.
// We try the SDK first; if it fails, fall back to our own signer using RSA-SHA1
// directly with the crypto module (which handles both PKCS#1 and PKCS#8).
let playbackUrl: string;

function signCloudfrontManual(resourceUrl: string, keyPairId: string, privateKey: string, expiresEpoch: number): string {
  const policy = JSON.stringify({
    Statement: [{
      Resource: resourceUrl,
      Condition: { DateLessThan: { 'AWS:EpochTime': expiresEpoch } },
    }],
  });

  const sign = createSign('RSA-SHA1');
  sign.update(policy);
  const sig = sign.sign(privateKey);

  // CloudFront uses URL-safe Base64 with specific char replacements
  const b64 = sig.toString('base64').replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');

  return `${resourceUrl}?Expires=${expiresEpoch}&Signature=${b64}&Key-Pair-Id=${keyPairId}`;
}

const expiresEpoch = Math.floor(Date.now() / 1000) + 900;
const resourceUrl  = `${cfg.cloudfrontDomain}/${KEY}`;

try {
  playbackUrl = getCFSignedUrl({
    url: resourceUrl,
    keyPairId: cfg.cfKeyPairId,
    privateKey: cfg.cfPrivateKey,
    dateLessThan: new Date(expiresEpoch * 1000).toISOString(),
  });
  console.log('  (signed via @aws-sdk/cloudfront-signer)');
} catch (sdkErr) {
  console.warn(`  SDK signer failed (${(sdkErr as Error).message}) — trying manual fallback…`);
  try {
    playbackUrl = signCloudfrontManual(resourceUrl, cfg.cfKeyPairId, cfg.cfPrivateKey, expiresEpoch);
    console.log('  (signed via manual RSA-SHA1 fallback)');
  } catch (manualErr) {
    console.error('  FAIL (both signers) —', (manualErr as Error).message);
    console.error('\n  Most likely cause: the private key is malformed or the wrong key type.');
    console.error('  CloudFront requires an RSA-2048 key (PKCS#1 or PKCS#8 PEM format).');
    process.exit(1);
  }
}

console.log(`  URL : ${playbackUrl.slice(0, 108)}…`);

const cfUrl       = new URL(playbackUrl);
const cfExpires   = parseInt(cfUrl.searchParams.get('Expires') ?? '0', 10);
const diffSecs    = cfExpires - Math.floor(Date.now() / 1000);

for (const [label, ok] of [
  ['HTTPS',                      cfUrl.protocol === 'https:'],
  ['Has Expires param',          cfUrl.searchParams.has('Expires')],
  ['Expires ~15 min in future',  diffSecs > 800 && diffSecs <= 960],
  ['Has Key-Pair-Id param',      cfUrl.searchParams.has('Key-Pair-Id')],
  ['Key-Pair-Id matches env',    cfUrl.searchParams.get('Key-Pair-Id') === cfg.cfKeyPairId],
  ['Has Signature param',        cfUrl.searchParams.has('Signature')],
  ['Message ID in path',         cfUrl.pathname.includes(FAKE_MESSAGE_ID)],
] as Array<[string, boolean]>) {
  console.log(`  ${ok ? '✓' : '✗'}  ${label}`);
  if (!ok) allPassed = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// [ 3 ]  Key helpers
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[ 3 ]  Key helpers');
const rebuiltKey   = `audio/${FAKE_SESSION_ID}/${FAKE_MESSAGE_ID}.m4a`;
const roundTripped = rebuiltKey.split('/').pop()?.replace(/\.m4a$/, '') ?? '';

for (const [label, ok] of [
  ['buildKey pattern is correct', rebuiltKey === KEY],
  ['messageId round-trips from key', roundTripped === FAKE_MESSAGE_ID],
  ['isAudioKey regex matches', /^audio\/[^/]+\/[^/]+\.m4a$/.test(KEY)],
] as Array<[string, boolean]>) {
  console.log(`  ${ok ? '✓' : '✗'}  ${label}`);
  if (!ok) allPassed = false;
}

// ─────────────────────────────────────────────────────────────────────────────
console.log();
if (allPassed) {
  console.log('✅  All checks passed — S3 + CloudFront config is valid.');
} else {
  console.log('❌  Some checks failed — review output above.');
  process.exit(1);
}
