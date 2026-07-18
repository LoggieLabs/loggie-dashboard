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
              icon="💾"
            />
            <StatCard
              title="Operations/sec"
              value={analytics.instantaneous_ops_per_sec.toLocaleString()}
              subtitle={`Total: ${analytics.total_commands_processed.toLocaleString()}`}
              icon="⚡"
            />
            <StatCard
              title="Cache Hit Rate"
              value={`${analytics.hit_rate.toFixed(2)}%`}
              subtitle={`${analytics.keyspace_hits.toLocaleString()} hits / ${analytics.keyspace_misses.toLocaleString()} misses`}
              icon="🎯"
            />
            <StatCard
              title="Uptime"
              value={`${analytics.uptime_in_days} days`}
              subtitle={`${analytics.connected_clients} clients`}
              icon="⏱️"
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
                  <h4 className="text-sm font-semibold text-gray-400 mb-4">
                    Queue: {selectedQueue.name}
                  </h4>
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-white">{selectedQueue.length}</div>
                    <div className="text-sm text-gray-400">items in queue</div>
                  </div>

                  {selectedQueue.items && selectedQueue.items.length > 0 && (
                    <>
                      <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                        Most Recent Items (newest first, up to 20)
                      </h5>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {selectedQueue.items.map((item, idx) => (
                          <div key={idx} className="bg-gray-900/50 rounded p-2">
                            <pre className="text-xs text-gray-300 overflow-x-auto">
                              {JSON.stringify(item, null, 2)}
                            </pre>
                          </div>
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

function StatCard({ title, value, subtitle, icon }: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
}) {
  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-400">{title}</div>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
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
