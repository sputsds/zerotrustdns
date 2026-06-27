import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const toml = readFileSync('wrangler.toml', 'utf8');
if (toml.match(/database_id\s*=\s*"[a-f0-9-]{36}"/)) {
  console.log('D1 already configured, skipping.');
  process.exit(0);
}

console.log('Creating D1 database...');
try {
  const out = execSync('npx wrangler d1 create zerotrustdns_db 2>&1', { encoding: 'utf8' });
  const match = out.match(/database_id\s*=\s*"([a-f0-9-]{36})"/);
  if (!match) throw new Error('Could not parse database_id from output:\n' + out);
  const id = match[1];
  console.log('D1 created:', id);
  const updated = toml + `\ndatabase_id = "${id}"\n`;
  writeFileSync('wrangler.toml', toml.replace('database_name = "zerotrustdns_db"', `database_name = "zerotrustdns_db"\ndatabase_id = "${id}"`));
  console.log('wrangler.toml updated.');
} catch(e) {
  console.error(e.message);
  process.exit(1);
}
