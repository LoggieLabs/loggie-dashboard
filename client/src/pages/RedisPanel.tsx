import { useState, useEffect } from 'react';

interface RedisAnalytics {
  healthy: boolean;
  connected_clients: number;
  used_memory_human: string;
  used_memory_peak_human: string;
  total_commands_processed: number;
  instantaneous_ops_per_sec: number;
  total_connections_received: number;
  uptime_in_days: number;
  keyspace_hits: number;
  keyspace_misses: number;
  hit_rate: number;
  total_keys: number;
}

interface QueueStats {
  name: string;
  length: number;
  memoryUsage?: number;
  items?: any[];
}

const REFRESH_INTERVAL = 5000; // 5 seconds

export default function RedisPanel() {
  const [analytics, setAnalytics] = useState<RedisAnalytics | null>(null);
  const [queues, setQueues] = useState<QueueStats[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<QueueStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/redis/analytics');
      if (!response.ok) {
        throw new Error('Failed to fetch Redis analytics');
      }
      const data = await response.json();
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueues = async () => {
    try {
      const response = await fetch('/api/redis/queues');
      if (!response.ok) {
        throw new Error('Failed to fetch Redis queues');
      }
      const data = await response.json();
      setQueues(data);
    } catch (err) {
      console.error('Error fetching queues:', err);
    }
  };

  const fetchQueueDetails = async (queueName: string) => {
    try {
      const response = await fetch(`/api/redis/queues/${queueName}`);
      if (!response.ok) {
        throw new Error('Failed to fetch queue details');
      }
      const data = await response.json();
      setSelectedQueue(data);
    } catch (err) {
      console.error('Error fetching queue details:', err);
    }
  };

  const clearQueue = async (queueName: string) => {
    if (!confirm(`Are you sure you want to clear queue "${queueName}"?`)) return;

    try {
      const response = await fetch(`/api/redis/queues/${queueName}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to clear queue');
      }

      if (selectedQueue?.name === queueName) {
        setSelectedQueue(null);
      }

      // Refresh queues list
      await fetchQueues();
    } catch (err) {
      console.error('Error clearing queue:', err);
      alert(`Failed to clear queue: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchAnalytics();
    fetchQueues();

    // Poll every 5 seconds
    const interval = setInterval(() => {
      fetchAnalytics();
      fetchQueues();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading Redis analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400">
          <span className="text-xl">⚠</span>
          <span>Redis Error: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Redis Status Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Redis Analytics</h2>
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${analytics?.healthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">
            {analytics?.healthy ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {analytics && (
        <>
          {/* Analytics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Memory Usage"
              value={analytics.used_memory_human}
              subtitle={`Peak: ${analytics.used_memory_peak_human}`}
            />
            <StatCard
              title="Operations/sec"
              value={analytics.instantaneous_ops_per_sec.toLocaleString()}
              subtitle={`Total: ${analytics.total_commands_processed.toLocaleString()}`}
            />
            <StatCard
              title="Cache Hit Rate"
              value={`${analytics.hit_rate.toFixed(2)}%`}
              subtitle={`${analytics.keyspace_hits.toLocaleString()} hits / ${analytics.keyspace_misses.toLocaleString()} misses`}
            />
            <StatCard
              title="Uptime"
              value={`${analytics.uptime_in_days} days`}
              subtitle={`${analytics.connected_clients} clients`}
            />
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat label="Total Keys" value={analytics.total_keys.toLocaleString()} />
            <MiniStat label="Total Connections" value={analytics.total_connections_received.toLocaleString()} />
            <MiniStat label="Connected Clients" value={analytics.connected_clients.toString()} />
            <MiniStat label="Commands Processed" value={analytics.total_commands_processed.toLocaleString()} />
          </div>
        </>
      )}

      {/* Queue Manager */}
      <div className="mt-8">
        <h3 className="text-xl font-bold text-white mb-4">Queue Manager</h3>

        {queues.length === 0 ? (
          <div className="panel text-center text-gray-400">
            No queues found
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Queue List */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Active Queues ({queues.length})</h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {queues.map((queue) => (
                  <div
                    key={queue.name}
                    className={`panel cursor-pointer transition-colors ${
                      selectedQueue?.name === queue.name
                        ? 'ring-2 ring-loggie-400'
                        : 'hover:border-[#31465b]'
                    }`}
                    onClick={() => fetchQueueDetails(queue.name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate">{queue.name}</div>
                        <div className="text-sm text-gray-400 mt-1">
                          {queue.length} items
                          {queue.memoryUsage && ` • ${formatBytes(queue.memoryUsage)}`}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearQueue(queue.name);
                        }}
                        className="ml-4 px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Queue Details */}
            <div>
              {selectedQueue ? (
                <div className="panel">
                  <div className="flex items-end justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <div className="eyebrow mb-1">Queue</div>
                      <div className="mono text-sm text-white truncate" title={selectedQueue.name}>
                        {selectedQueue.name}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="stat-value">{selectedQueue.length.toLocaleString()}</div>
                      <div className="stat-label">items</div>
                    </div>
                  </div>

                  {selectedQueue.items && selectedQueue.items.length > 0 && (
                    <>
                      <h5 className="eyebrow mb-3">Recent items · newest first · up to 20</h5>
                      <div className="space-y-1.5 max-h-[30rem] overflow-y-auto pr-1">
                        {selectedQueue.items.map((item, idx) => (
                          <QueueItem key={idx} raw={item} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="panel text-center text-gray-400">
                  Select a queue to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="metric">
      <h3 className="eyebrow mb-3">{title}</h3>
      <div className="stat-value">{value}</div>
      <div className="stat-label mt-1">{subtitle}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="mono tnum text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/* ── Universal queue-stream item rendering ─────────────────────────────────
   Redis list items are usually JSON strings (sometimes double-encoded). We
   parse defensively, then show a headline + severity + time derived from
   common field names, with a syntax-highlighted, collapsible JSON body. No
   field is required, so this degrades gracefully for any stream shape. */

function parseDeep(v: any, depth = 0): any {
  if (depth > 4) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if ((s[0] === '{' && s[s.length - 1] === '}') || (s[0] === '[' && s[s.length - 1] === ']')) {
      try { return parseDeep(JSON.parse(s), depth + 1); } catch { return v; }
    }
  }
  return v;
}

function firstVal(o: any, keys: string[]): any {
  for (const k of keys) {
    if (o && o[k] !== undefined && o[k] !== null && typeof o[k] !== 'object') return o[k];
  }
  return undefined;
}

function severityOf(o: any): 'ok' | 'warn' | 'bad' | null {
  if (!o || typeof o !== 'object') return null;
  if (o.should_alert === true) return 'bad';
  const score = firstVal(o, ['risk_score', 'riskScore', 'score', 'severity_score']);
  if (typeof score === 'number') { if (score >= 4) return 'bad'; if (score >= 2.5) return 'warn'; }
  const word = String(firstVal(o, ['classification', 'severity', 'level', 'status', 'risk', 'priority', 'result']) ?? '').toLowerCase();
  if (/attack|critical|fatal|high|danger|error|fail|malicious/.test(word)) return 'bad';
  if (/mev|medium|warn|suspect|elevated|degraded|review/.test(word)) return 'warn';
  if (/low|safe|ok|info|normal|success|healthy|clean|pass/.test(word)) return 'ok';
  return typeof score === 'number' ? 'ok' : null;
}

function headlineOf(o: any): string | null {
  if (o == null) return null;
  if (typeof o !== 'object') return String(o);
  const h = firstVal(o, ['summary', 'message', 'msg', 'title', 'label', 'name', 'event', 'type', 'description', 'text', 'kind']);
  return h != null ? String(h) : null;
}

function timeOf(o: any): Date | string | null {
  const t = firstVal(o, ['datetime', 'timestamp', 'time', 'created_at', 'createdAt', 'date', 'ts']);
  if (t == null) return null;
  let d: Date;
  if (typeof t === 'number') d = new Date(t > 1e12 ? t : t * 1000);
  else {
    const n = Number(t);
    d = isNaN(n) ? new Date(t) : new Date(n > 1e12 ? n : n * 1000);
  }
  return isNaN(d.getTime()) ? (typeof t === 'string' ? t : null) : d;
}

function agoOrTime(t: Date | string): string {
  if (!(t instanceof Date)) return String(t);
  const s = Math.floor((Date.now() - t.getTime()) / 1000);
  if (s < 0) return t.toLocaleTimeString();
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return t.toLocaleDateString();
}

function truncMid(s: string, max = 46): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function QueueItem({ raw }: { raw: any }) {
  const data = parseDeep(raw);
  const isObj = data != null && typeof data === 'object' && !Array.isArray(data);
  const sev = isObj ? severityOf(data) : null;
  const headline = headlineOf(data) ?? (typeof data === 'object' ? 'record' : String(data));
  const time = isObj ? timeOf(data) : null;
  const dot = sev === 'bad' ? 'var(--bad)' : sev === 'warn' ? 'var(--warn)' : sev === 'ok' ? 'var(--ok)' : 'var(--faint)';
  return (
    <details className="qitem">
      <summary>
        <span className="qdot" style={{ background: dot }} />
        <span className="qhead">{headline}</span>
        {time && <span className="qtime">{agoOrTime(time)}</span>}
        <span className="qchev">▸</span>
      </summary>
      <div className="qbody">
        {typeof data === 'object'
          ? <JsonView data={data} />
          : <span className="js" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(data)}</span>}
      </div>
    </details>
  );
}

function JsonScalar({ v }: { v: any }) {
  if (v === null) return <span className="jz">null</span>;
  const t = typeof v;
  if (t === 'number') return <span className="jn">{String(v)}</span>;
  if (t === 'boolean') return <span className="jb">{String(v)}</span>;
  const s = String(v);
  return <span className="js" title={s.length > 46 ? s : undefined}>"{truncMid(s)}"</span>;
}

function JsonView({ data, depth = 0 }: { data: any; depth?: number }) {
  const isArr = Array.isArray(data);
  const entries: [string, any][] = isArr
    ? (data as any[]).map((v, i) => [String(i), v])
    : Object.entries(data ?? {});

  // Inline a short scalar array: [ 1, 2, 3 ]
  if (isArr && entries.every(([, v]) => v === null || typeof v !== 'object')) {
    const joined = entries.reduce((n, [, v]) => n + String(v).length + 2, 0);
    if (entries.length <= 4 && joined < 56) {
      return (
        <span>
          <span className="jz">[ </span>
          {entries.map(([, v], i) => (
            <span key={i}>{i > 0 && <span className="jz">, </span>}<JsonScalar v={v} /></span>
          ))}
          <span className="jz"> ]</span>
        </span>
      );
    }
  }

  return (
    <div style={{ paddingLeft: depth ? 14 : 0 }}>
      {entries.map(([k, v]) => {
        const nested = v !== null && typeof v === 'object';
        return (
          <div key={k}>
            {isArr ? <span className="jz">– </span> : <><span className="jk">{k}</span><span className="jz">: </span></>}
            {nested ? <JsonView data={v} depth={depth + 1} /> : <JsonScalar v={v} />}
          </div>
        );
      })}
    </div>
  );
}
