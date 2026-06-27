import { ReactNode } from 'react';

type Tab = 'privacy' | 'allowlist' | 'denylist' | 'analytics';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: ReactNode;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'privacy', label: 'Privacy', icon: '🛡️' },
  { id: 'allowlist', label: 'Allowlist', icon: '✅' },
  { id: 'denylist', label: 'Denylist', icon: '🚫' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
];

export default function Layout({ activeTab, onTabChange, children }: Props) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        padding: '20px 12px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px', marginBottom: 28 }}>
          <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
            <path d="M32 10 L50 18 L50 32 C50 44 40 54 32 57 C24 54 14 44 14 32 L14 18 Z" stroke="#38bdf8" strokeWidth="3" fill="none"/>
            <circle cx="32" cy="33" r="6" fill="#38bdf8"/>
            <path d="M32 27 L32 18" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.2px' }}>ZeroTrustDNS</span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 'var(--radius)',
                background: activeTab === tab.id ? 'rgba(56,189,248,0.1)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 600 : 400,
                fontSize: 13.5,
                textAlign: 'left',
                border: activeTab === tab.id ? '1px solid rgba(56,189,248,0.2)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* DoH info */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '10px 12px',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>DoH Endpoint</div>
          <code style={{ wordBreak: 'break-all', fontSize: 10.5 }}>
            {window.location.origin}/dns-query
          </code>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '28px 32px',
      }}>
        {children}
      </main>
    </div>
  );
}
