import { useState, useEffect, FormEvent } from 'react';
import { api, List, clearSavedKey } from '../../services/api';

const DEFAULT_LISTS: { url: string; name: string; type: 'block' | 'allow' }[] = [
  {
    name: 'AdGuard DNS Filter',
    url: 'https://adguardteam.github.io/AdguardFilters/BaseFilter/sections/adservers.txt',
    type: 'block',
  },
  {
    name: 'hostsVN',
    url: 'https://raw.githubusercontent.com/bigdargon/hostsVN/master/hosts',
    type: 'block',
  },
];

type SubTab = 'blocklists' | 'setup';

export default function PrivacyView() {
  const [subTab, setSubTab] = useState<SubTab>('blocklists');
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Change key state
  const [newKey, setNewKey] = useState('');
  const [changingKey, setChangingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState('');

  async function load() {
    try {
      const data = await api.getLists();
      setLists(data);
    } catch { }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!loading && lists.length === 0 && !seeded) {
      setSeeded(true);
      seedDefaults();
    }
  }, [loading, lists.length]);

  async function handleSync() {
    setSyncing(true);
    try { await api.syncLists(); await load(); } catch { }
    finally { setSyncing(false); }
  }

  async function seedDefaults() {
    for (const l of DEFAULT_LISTS) {
      try { await api.addList(l.url, l.name, l.type); } catch { }
    }
    // Auto-sync after seeding so lists are active immediately
    try { await api.syncLists(); } catch { }
    load();
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!addUrl.trim() || !addName.trim()) return;
    setAdding(true);
    setError('');
    try {
      await api.addList(addUrl.trim(), addName.trim(), 'block');
      setAddUrl(''); setAddName('');
      load();
    } catch { setError('Failed to add list. URL may already exist.'); }
    finally { setAdding(false); }
  }

  async function handleToggle(list: List) {
    try {
      await api.toggleList(list.id, !list.enabled);
      setLists(prev => prev.map(l => l.id === list.id ? { ...l, enabled: !l.enabled } : l));
    } catch { }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this filter list?')) return;
    try { await api.deleteList(id); setLists(prev => prev.filter(l => l.id !== id)); }
    catch { }
  }

  async function handleChangeKey(e: FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || newKey.trim().length < 16) {
      setKeyMsg('Key must be at least 16 characters.');
      return;
    }
    setChangingKey(true);
    setKeyMsg('');
    try {
      await api.changeKey(newKey.trim());
      clearSavedKey();
      setKeyMsg('Key changed. You will be logged out.');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setKeyMsg('Failed to change key.');
    } finally { setChangingKey(false); }
  }

  function formatDate(ts?: number) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString();
  }

  const dohEndpoint = `${window.location.origin}/dns-query`;

  function generateMobileConfig() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>${dohEndpoint}</string>
      </dict>
      <key>PayloadDescription</key>
      <string>Configures DNS over HTTPS using ZeroTrustDNS</string>
      <key>PayloadDisplayName</key>
      <string>ZeroTrustDNS</string>
      <key>PayloadIdentifier</key>
      <string>com.zerotrustdns.doh</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>ZeroTrustDNS DNS over HTTPS profile</string>
  <key>PayloadDisplayName</key>
  <string>ZeroTrustDNS</string>
  <key>PayloadIdentifier</key>
  <string>com.zerotrustdns</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>B2C3D4E5-F6A7-8901-BCDE-F12345678901</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
    const blob = new Blob([xml], { type: 'application/x-apple-aspen-config' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ZeroTrustDNS.mobileconfig';
    a.click();
    URL.revokeObjectURL(url);
  }

  const subTabStyle = (active: boolean) => ({
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    fontWeight: active ? 600 : 400,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Privacy</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
        Manage blocklists and DNS setup.
      </p>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        <button style={subTabStyle(subTab === 'blocklists')} onClick={() => setSubTab('blocklists')}>Blocklists</button>
        <button style={subTabStyle(subTab === 'setup')} onClick={() => setSubTab('setup')}>Set up</button>
      </div>

      {subTab === 'blocklists' && (
        <>
          {/* Add list form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Add Filter List</h3>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input type="text" placeholder="List name" value={addName} onChange={e => setAddName(e.target.value)} style={{ width: 200, flex: 'none' }} />
              <input type="url" placeholder="https://example.com/blocklist.txt" value={addUrl} onChange={e => setAddUrl(e.target.value)} style={{ flex: 1, minWidth: 260 }} />
              <button type="submit" className="btn-primary" disabled={adding || !addUrl.trim() || !addName.trim()} style={{ flex: 'none' }}>
                {adding ? 'Adding…' : 'Add'}
              </button>
            </form>
            {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</p>}
          </div>

          {/* Lists table */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                Active Lists
                <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>{lists.length} total</span>
              </h3>
              <button className="btn-primary" onClick={handleSync} disabled={syncing} style={{ fontSize: 12, padding: '6px 14px' }}>
                {syncing ? 'Syncing…' : '↻ Sync Now'}
              </button>
            </div>

            {loading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
            ) : lists.length === 0 ? (
              <div className="empty">No lists added yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Enabled</th>
                    <th>Name</th>
                    <th>Domains</th>
                    <th>Last Synced</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lists.map(list => (
                    <tr key={list.id}>
                      <td>
                        <label className="toggle">
                          <input type="checkbox" checked={list.enabled} onChange={() => handleToggle(list)} />
                          <span className="toggle-slider" />
                        </label>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{list.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          <a href={list.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} title={list.url}>
                            {list.url.length > 60 ? list.url.slice(0, 60) + '…' : list.url}
                          </a>
                        </div>
                      </td>
                      <td>{list.domain_count ? list.domain_count.toLocaleString() : '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(list.last_synced_at)}</td>
                      <td>
                        {list.sync_error ? (
                          <span className="badge badge-block" title={list.sync_error}>Error</span>
                        ) : list.last_synced_at ? (
                          <span className="badge badge-enabled">Synced</span>
                        ) : (
                          <span className="badge badge-disabled">Pending</span>
                        )}
                      </td>
                      <td>
                        <button className="btn-danger" onClick={() => handleDelete(list.id)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {subTab === 'setup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* DoH Endpoint */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>DoH Endpoint</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ flex: 1, background: 'var(--surface2)', padding: '10px 14px', borderRadius: 8, fontSize: 13, wordBreak: 'break-all', border: '1px solid var(--border)' }}>
                {dohEndpoint}
              </code>
              <button className="btn-primary" style={{ flexShrink: 0 }} onClick={() => navigator.clipboard.writeText(dohEndpoint)}>
                Copy
              </button>
            </div>
          </div>

          {/* Browser setup */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Browser / Desktop Setup</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Chrome */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Chrome / Edge</div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                  <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → Privacy and security → Security</code></li>
                  <li>Enable <strong>Use secure DNS</strong></li>
                  <li>Choose <strong>With: Custom</strong></li>
                  <li>Paste your DoH endpoint above</li>
                </ol>
              </div>

              {/* Firefox */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Firefox</div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                  <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → Privacy & Security</code></li>
                  <li>Scroll to <strong>DNS over HTTPS</strong></li>
                  <li>Select <strong>Custom</strong></li>
                  <li>Paste your DoH endpoint above</li>
                </ol>
              </div>

              {/* Windows */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Windows 11 (system-wide)</div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                  <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → Network & internet → Wi-Fi → your network → DNS server assignment</code></li>
                  <li>Set to <strong>Manual</strong>, enable <strong>Preferred DNS encryption</strong></li>
                  <li>Enter your DoH endpoint</li>
                </ol>
              </div>

              {/* macOS */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>macOS</div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                  <li>Download the iOS profile below (works on macOS too)</li>
                  <li>Open it — macOS will prompt to install in <strong>System Settings → Privacy & Security → Profiles</strong></li>
                </ol>
              </div>
            </div>
          </div>

          {/* iOS profile */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>iOS / macOS Profile</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Download and install this profile to enable ZeroTrustDNS system-wide on iPhone, iPad, or Mac — no app needed.
            </p>
            <ol style={{ margin: '0 0 16px 0', paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
              <li>Tap <strong>Download Profile</strong> below</li>
              <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → General → VPN & Device Management</code></li>
              <li>Tap the downloaded profile → <strong>Install</strong></li>
            </ol>
            <button className="btn-primary" onClick={generateMobileConfig} style={{ fontSize: 13, padding: '9px 20px' }}>
              ↓ Download Profile (.mobileconfig)
            </button>
          </div>

          {/* Change key */}
          <div className="card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Change Access Key</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              Set a new access key. You will be logged out immediately after changing.
            </p>
            <form onSubmit={handleChangeKey} style={{ display: 'flex', gap: 10 }}>
              <input
                type="password"
                placeholder="New access key (min. 16 characters)"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                style={{ flex: 1, fontSize: 13 }}
              />
              <button type="submit" className="btn-primary" disabled={changingKey || newKey.trim().length < 16} style={{ flexShrink: 0 }}>
                {changingKey ? 'Saving…' : 'Change Key'}
              </button>
            </form>
            {keyMsg && (
              <p style={{ fontSize: 12, marginTop: 8, color: keyMsg.includes('changed') ? 'var(--success)' : 'var(--danger)' }}>{keyMsg}</p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
