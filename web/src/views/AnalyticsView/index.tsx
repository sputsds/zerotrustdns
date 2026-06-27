import { useState, useEffect } from 'react';
import { api, Analytics, QueryLog } from '../../services/api';

type Period = '24h' | '7d' | '30d';

export default function AnalyticsView() {
  const [period, setPeriod] = useState<Period>('24h');
  const [stats, setStats] = useState<Analytics | null>(null);
  const [logs, setLogs] = useState<QueryLog[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([api.getAnalytics(period), api.getLogs(200)]);
      setStats(s);
      setLogs(l);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [period]);

  function formatTime(ts: number) {
    return new Date(ts * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const passCount = logs.filter(l => l.action === 'PASS').length;
  const blockCount = logs.filter(l => l.action === 'BLOCK').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Analytics</h2>
          <p style={{ color: 'var(--text-muted)' }}>DNS query statistics and recent query log.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['24h', '7d', '30d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={period === p ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '6px 14px', fontSize: 12 }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard
          label="Total Queries"
          value={loading ? '…' : (stats?.total ?? 0).toLocaleString()}
          sub={`Last ${period}`}
          color="var(--accent)"
        />
        <StatCard
          label="Blocked"
          value={loading ? '…' : (stats?.blocked ?? 0).toLocaleString()}
          sub={`${stats?.percent_blocked ?? 0}% of total`}
          color="var(--danger)"
        />
        <StatCard
          label="Allowed"
          value={loading ? '…' : ((stats?.total ?? 0) - (stats?.blocked ?? 0)).toLocaleString()}
          sub={`${100 - (stats?.percent_blocked ?? 0)}% of total`}
          color="var(--success)"
        />
      </div>

      {/* Block rate bar */}
      {stats && stats.total > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Block rate</span>
            <span style={{ color: 'var(--text-muted)' }}>{stats.percent_blocked}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${stats.percent_blocked}%`,
              background: `linear-gradient(90deg, var(--danger), var(--warning))`,
              borderRadius: 4,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Recent queries */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          Recent Queries
          <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>
            {passCount} allowed · {blockCount} blocked (last 200)
          </span>
        </h3>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
        ) : logs.length === 0 ? (
          <div className="empty">No queries logged yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Domain</th>
                  <th>Type</th>
                  <th>Action</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatTime(log.timestamp)}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{log.domain}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{log.record_type}</td>
                    <td>
                      <span className={`badge ${log.action === 'PASS' ? 'badge-pass' : 'badge-block'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{log.reason ?? '—'}</td>
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

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 4, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}
