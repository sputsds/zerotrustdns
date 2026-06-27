import { useState, useEffect, FormEvent } from 'react';
import { api, List } from '../../services/api';

const DEFAULT_LISTS: { url: string; name: string; type: 'block' | 'allow' }[] = [
  {
    name: 'AdGuard DNS Filter',
    url: 'https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt',
    type: 'block',
  },
  {
    name: 'hostsVN',
    url: 'https://raw.githubusercontent.com/bigdargon/hostsVN/master/hosts',
    type: 'block',
  },
];

export default function PrivacyView() {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  function formatDate(ts?: number) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString();
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Privacy</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Manage blocklists.</p>

      {/* Add list form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Add Filter List</h3>
        <form className="add-list-form" onSubmit={handleAdd} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Enabled</th>
                  <th>Name</th>
                  <th className="col-hide-mobile">Domains</th>
                  <th className="col-hide-mobile">Last Synced</th>
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
                          {list.url.length > 50 ? list.url.slice(0, 50) + '…' : list.url}
                        </a>
                      </div>
                    </td>
                    <td className="col-hide-mobile">{list.domain_count ? list.domain_count.toLocaleString() : '—'}</td>
                    <td className="col-hide-mobile" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(list.last_synced_at)}</td>
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
          </div>
        )}
      </div>
    </div>
  );
}
