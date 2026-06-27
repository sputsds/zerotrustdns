import { ReactNode } from 'react';
import { Tab } from '../App';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  children: ReactNode;
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'allowlist', label: 'Allowlist' },
  { id: 'denylist', label: 'Denylist' },
  { id: 'analytics', label: 'Analytics' },
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
        {/* Logo — clicking navigates to setup (home) */}
        <div style={{ padding: '0 8px', marginBottom: 28 }}>
          <a
            href="#setup"
            onClick={(e) => { e.preventDefault(); onTabChange('setup'); }}
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--text)',
              letterSpacing: '-0.2px',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            ZeroTrustDNS
          </a>
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
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />
        {/* DoH endpoint widget removed */}
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
