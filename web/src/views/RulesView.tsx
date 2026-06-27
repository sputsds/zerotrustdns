import { useState, useEffect, FormEvent } from 'react';
import { api, Rule } from '../services/api';

interface Props {
  ruleType: 'ALLOW' | 'BLOCK';
  title: string;
  description: string;
  placeholder?: string;
}

export default function RulesView({ ruleType, title, description, placeholder }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const all = await api.getRules();
      setRules(all.filter((r: Rule) => r.type === ruleType));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [ruleType]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//i, '').split('/')[0];
    if (!d) return;
    setAdding(true);
    setError('');
    try {
      await api.addRule(ruleType, d);
      setDomain('');
      load();
    } catch {
      setError('Failed to add. Domain may already exist.');
    } finally { setAdding(false); }
  }

  async function handleDelete(id: number) {
    try { await api.deleteRule(id); setRules(prev => prev.filter((r: Rule) => r.id !== id)); }
    catch { /* ignore */ }
  }

  const color = ruleType === 'ALLOW' ? 'var(--success)' : 'var(--danger)';
  const badgeClass = ruleType === 'ALLOW' ? 'badge-pass' : 'badge-block';

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, maxWidth: 560 }}>{description}</p>

      {/* Add form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Add Domain</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            placeholder={placeholder || 'example.com'}
            value={domain}
            onChange={e => setDomain(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" disabled={adding || !domain.trim()} style={{ flex: 'none' }}>
            {adding ? 'Adding…' : `${ruleType === 'ALLOW' ? 'Allow' : 'Deny'} Domain`}
          </button>
        </form>
        {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</p>}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Subdomain matching is automatic — adding <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>example.com</code> also covers <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>*.example.com</code>.
        </p>
      </div>

      {/* Rules table */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          {ruleType === 'ALLOW' ? 'Allowed' : 'Denied'} Domains
          <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>
            {rules.length} entries
          </span>
        </h3>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
        ) : rules.length === 0 ? (
          <div className="empty">
            No {ruleType === 'ALLOW' ? 'allow' : 'deny'} rules yet.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Domain</th>
                <th>Covers</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td>
                    <span className={`badge ${badgeClass}`}>{rule.type}</span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 500, color }}>{rule.domain}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {rule.domain} and *.{rule.domain}
                  </td>
                  <td>
                    <button className="btn-danger" onClick={() => handleDelete(rule.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

