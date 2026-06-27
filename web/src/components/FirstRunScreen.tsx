import { useState } from 'react';

interface Props {
  secretKey: string;
  onConfirmed: () => void;
}

export default function FirstRunScreen({ secretKey, onConfirmed }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
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
          <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13 }}>Setup complete — your access key has been generated</p>
        </div>

        {/* Warning banner */}
        <div style={{
          background: 'rgba(234, 179, 8, 0.08)',
          border: '1px solid rgba(234, 179, 8, 0.35)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
          <div>
            <p style={{ color: '#ca8a04', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              This key will only be shown once
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
              Copy and save it somewhere safe — a password manager, secure note, etc.
              Once you click <strong>"I've saved it"</strong>, it will never be displayed again.
              If you lose it, you will not be able to access the dashboard.
            </p>
          </div>
        </div>

        {/* Key display */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Your Access Key
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              fontSize: 13,
              fontFamily: 'ui-monospace, monospace',
              color: 'var(--text)',
              wordBreak: 'break-all',
              flex: 1,
              lineHeight: 1.6,
              letterSpacing: '0.03em',
            }}>
              {secretKey}
            </code>
            <button
              onClick={handleCopy}
              style={{
                flexShrink: 0,
                padding: '6px 12px',
                fontSize: 12,
                background: copied ? 'rgba(34, 197, 94, 0.12)' : 'var(--surface2)',
                color: copied ? '#22c55e' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontWeight: 500,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Confirm checkbox */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--text)',
        }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#38bdf8' }}
          />
          I have saved my access key in a secure place
        </label>

        <button
          className="btn-primary"
          disabled={!confirmed}
          onClick={onConfirmed}
          style={{ width: '100%', padding: '11px', fontSize: 14, opacity: confirmed ? 1 : 0.45, cursor: confirmed ? 'pointer' : 'not-allowed' }}
        >
          I've saved it — Go to dashboard
        </button>
      </div>
    </div>
  );
}
