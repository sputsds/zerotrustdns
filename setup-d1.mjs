import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const toml = readFileSync('wrangler.toml', 'utf8');
if (toml.match(/database_id\s*=\s*"[a-f0-9-]{36}"/)) {
  console.log('D1 already configured, skipping.');
  process.exit(0);
}

// No database_id in wrangler.toml — try to create one.
// If this fails (e.g. Cloudflare one-click deploy manages D1 automatically),
// just skip and let Cloudflare handle the binding.
console.log('No database_id found, attempting to create D1 database...');
try {
  const out = execSync('npx wrangler d1 create zerotrustdns_db 2>&1', { encoding: 'utf8' });
  const match = out.match(/database_id\s*=\s*"([a-f0-9-]{36})"/);
  if (!match) throw new Error('Could not parse database_id:\n' + out);
  const id = match[1];
  console.log('D1 created:', id);
  writeFileSync('wrangler.toml', toml.replace('database_name = "zerotrustdns_db"', `database_name = "zerotrustdns_db"\ndatabase_id = "${id}"`));
  console.log('wrangler.toml updated.');
} catch(e) {
  console.log('Could not create D1 via CLI (this is expected on one-click deploy — Cloudflare manages the binding automatically). Skipping.');
}
