import { useState, useEffect, FormEvent } from 'react';
import { api, clearSavedKey } from '../../services/api';

const UPSTREAM_OPTIONS = [
  { label: 'Cloudflare Gateway 1', value: 'https://qi0w15q016.cloudflare-gateway.com/dns-query' },
  { label: 'Cloudflare Gateway 2', value: 'https://6in6o9osam.cloudflare-gateway.com/dns-query' },
  { label: 'Google DNS', value: 'https://dns.google/dns-query' },
  { label: 'Quad9', value: 'https://dns11.quad9.net/dns-query' },
  { label: 'NextDNS 1', value: 'https://dns.nextdns.io/458877' },
  { label: 'NextDNS 2', value: 'https://dns.nextdns.io/2e3434' },
  { label: 'Custom…', value: '__custom__' },
];

export default function SetupView() {
  const [currentKey, setCurrentKey] = useState('');
  const [newKey, setNewKey] = useState('');
  const [changingKey, setChangingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState('');

  const [upstream, setUpstream] = useState('https://security.cloudflare-dns.com/dns-query');
  const [customUpstream, setCustomUpstream] = useState('');
  const [savingUpstream, setSavingUpstream] = useState(false);
  const [upstreamMsg, setUpstreamMsg] = useState('');

  useEffect(() => {
    api.getSettings().then(s => {
      const known = UPSTREAM_OPTIONS.find(o => o.value === s.upstream_doh);
      if (known) {
        setUpstream(s.upstream_doh);
      } else {
        setUpstream('__custom__');
        setCustomUpstream(s.upstream_doh);
      }
    }).catch(() => {});
  }, []);

  async function handleSaveUpstream(e: FormEvent) {
    e.preventDefault();
    const url = upstream === '__custom__' ? customUpstream.trim() : upstream;
    if (!url.startsWith('https://')) { setUpstreamMsg('URL phải bắt đầu bằng https://'); return; }
    setSavingUpstream(true);
    setUpstreamMsg('');
    try {
      await api.saveSettings(url);
      setUpstreamMsg('Đã lưu! DNS queries sẽ dùng upstream mới ngay lập tức.');
    } catch {
      setUpstreamMsg('Lưu thất bại.');
    } finally { setSavingUpstream(false); }
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

  async function handleChangeKey(e: FormEvent) {
    e.preventDefault();
    if (!currentKey.trim()) {
      setKeyMsg('Please enter your current access key.');
      return;
    }
    if (!newKey.trim() || newKey.trim().length < 16) {
      setKeyMsg('New key must be at least 16 characters.');
      return;
    }
    setChangingKey(true);
    setKeyMsg('');
    try {
      await api.changeKey(currentKey.trim(), newKey.trim());
      clearSavedKey();
      setKeyMsg('Key changed. You will be logged out.');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setKeyMsg('Failed to change key. Current key may be incorrect.');
    } finally { setChangingKey(false); }
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Setup</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Configure your DNS endpoint and connect your devices.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Upstream DNS */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Upstream DNS Resolver</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Chọn server DNS mà ZeroTrustDNS sẽ forward query tới sau khi lọc. Google DNS và Quad9 hỗ trợ ECS giúp giảm latency.
          </p>
          <form onSubmit={handleSaveUpstream} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={upstream} onChange={e => setUpstream(e.target.value)}>
              {UPSTREAM_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {upstream === '__custom__' && (
              <input
                type="url"
                placeholder="https://your-upstream/dns-query"
                value={customUpstream}
                onChange={e => setCustomUpstream(e.target.value)}
                style={{ fontSize: 13 }}
              />
            )}
            <div>
              <button type="submit" className="btn-primary" disabled={savingUpstream} style={{ fontSize: 13 }}>
                {savingUpstream ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </form>
          {upstreamMsg && (
            <p style={{ fontSize: 12, marginTop: 8, color: upstreamMsg.includes('thất bại') ? 'var(--danger)' : 'var(--success)' }}>{upstreamMsg}</p>
          )}
        </div>

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

            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Chrome / Edge</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → Privacy and security → Security</code></li>
                <li>Enable <strong>Use secure DNS</strong></li>
                <li>Choose <strong>With: Custom</strong></li>
                <li>Paste your DoH endpoint above</li>
              </ol>
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Firefox</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → Privacy &amp; Security</code></li>
                <li>Scroll to <strong>DNS over HTTPS</strong></li>
                <li>Select <strong>Custom</strong></li>
                <li>Paste your DoH endpoint above</li>
              </ol>
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Windows 11 (system-wide)</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → Network &amp; internet → Wi-Fi → your network → DNS server assignment</code></li>
                <li>Set to <strong>Manual</strong>, enable <strong>Preferred DNS encryption</strong></li>
                <li>Enter your DoH endpoint</li>
              </ol>
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>macOS</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
                <li>Download the iOS profile below (works on macOS too)</li>
                <li>Open it — macOS will prompt to install in <strong>System Settings → Privacy &amp; Security → Profiles</strong></li>
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
            <li>Go to <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4 }}>Settings → General → VPN &amp; Device Management</code></li>
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
          <form onSubmit={handleChangeKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="password"
              placeholder="Current access key"
              value={currentKey}
              onChange={e => setCurrentKey(e.target.value)}
              style={{ fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="password"
                placeholder="New access key (min. 16 characters)"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                style={{ flex: 1, fontSize: 13 }}
              />
              <button type="submit" className="btn-primary" disabled={changingKey || !currentKey.trim() || newKey.trim().length < 16} style={{ flexShrink: 0 }}>
                {changingKey ? 'Saving…' : 'Change Key'}
              </button>
            </div>
          </form>
          {keyMsg && (
            <p style={{ fontSize: 12, marginTop: 8, color: keyMsg.includes('changed') ? 'var(--success)' : 'var(--danger)' }}>{keyMsg}</p>
          )}
        </div>

      </div>
    </div>
  );
}
