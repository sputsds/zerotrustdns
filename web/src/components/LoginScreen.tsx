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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56,
            height: 56,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M32 10 L50 18 L50 32 C50 44 40 54 32 57 C24 54 14 44 14 32 L14 18 Z" stroke="#38bdf8" strokeWidth="3" fill="none"/>
              <circle cx="32" cy="33" r="7" fill="#38bdf8"/>
              <path d="M32 26 L32 18" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>ZeroTrustDNS</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>Enter your access key to continue</p>
        </div>

        {/* Form */}
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
