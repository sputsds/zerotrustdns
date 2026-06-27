import { useState, useEffect, useRef } from 'react';
import { api, setKey, loadSavedKey } from './services/api';
import FirstRunScreen from './components/FirstRunScreen';
import LoginScreen from './components/LoginScreen';
import Layout from './components/Layout';
import SetupView from './views/SetupView';
import PrivacyView from './views/PrivacyView';
import RulesView from './views/RulesView';
import AnalyticsView from './views/AnalyticsView';

type AppState = 'loading' | 'first-run' | 'login' | 'dashboard';
export type Tab = 'setup' | 'privacy' | 'allowlist' | 'denylist' | 'analytics';

const VALID_TABS: Tab[] = ['setup', 'privacy', 'allowlist', 'denylist', 'analytics'];

function getHashTab(): Tab {
  const hash = window.location.hash.replace('#', '') as Tab;
  return VALID_TABS.includes(hash) ? hash : 'setup';
}

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [firstRunKey, setFirstRunKey] = useState('');
  const [tab, setTab] = useState<Tab>(getHashTab);
  const didInit = useRef(false); // ← FIX: prevent double-call in React StrictMode

  // Keep URL hash in sync with active tab
  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handler = () => setTab(getHashTab());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    if (didInit.current) return; // ← FIX: skip if already ran
    didInit.current = true;

    api.getStatus().then(status => {
      if (!status.initialized) {
        api.setup().then(res => {
          if (res.key) {
            setFirstRunKey(res.key);
            setState('first-run');
          } else {
            setState('login');
          }
        }).catch(() => setState('login'));
      } else {
        const saved = loadSavedKey();
        if (saved) {
          setKey(saved);
          api.checkAuth().then(ok => {
            if (ok) setState('dashboard');
            else setState('login');
          }).catch(() => setState('login'));
        } else {
          setState('login');
        }
      }
    }).catch(() => setState('login'));
  }, []);

  function handleFirstRunConfirmed() {
    setKey(firstRunKey);
    setState('dashboard');
  }

  if (state === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
        fontSize: 14,
      }}>
        Loading…
      </div>
    );
  }

  if (state === 'first-run') {
    return <FirstRunScreen secretKey={firstRunKey} onConfirmed={handleFirstRunConfirmed} />;
  }

  if (state === 'login') {
    return <LoginScreen onAuth={() => setState('dashboard')} />;
  }

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      {tab === 'setup' && <SetupView />}
      {tab === 'privacy' && <PrivacyView />}
      {tab === 'allowlist' && (
        <RulesView
          ruleType="ALLOW"
          title="Allowlist"
          description="Domains on the allowlist are always allowed, even if they appear in a blocklist. Adding a domain automatically allows all its subdomains."
          placeholder="example.com"
        />
      )}
      {tab === 'denylist' && (
        <RulesView
          ruleType="BLOCK"
          title="Denylist"
          description="Domains on the denylist are always blocked. Adding a domain automatically blocks all its subdomains."
          placeholder="example.com"
        />
      )}
      {tab === 'analytics' && <AnalyticsView />}
    </Layout>
  );
}
