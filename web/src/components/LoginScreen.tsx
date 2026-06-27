import { useState, FormEvent } from 'react';
import { setKey, api } from '../services/api';

interface Props { onAuth: () => void; }

export default function LoginScreen({ onAuth }: Props) {
  const [key, setKeyInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      setKey(key.trim());
      const ok = await api.checkAuth();
      if (ok) { onAuth(); }
      else { setError('Invalid key. Please try again.'); setKey(''); }
    } catch {
      setError('Connection error. Please try again.');
      setKey('');
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>ZeroTrustDNS</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>Enter your access key to continue</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Access key"
            value={key}
            onChange={e => setKeyInput(e.target.value)}
            autoFocus
            style={{ fontSize: 14, padding: '10px 14px' }}
          />
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>{error}</p>
          )}
          <button type="submit" className="btn-primary" disabled={loading || !key.trim()} style={{ padding: '10px', fontSize: 14 }}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>

        <p style={{ marginTop: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Enter the access key shown when you first deployed ZeroTrustDNS.
        </p>
      </div>
    </div>
  );
}
