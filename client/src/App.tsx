import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import RedisPanel from './pages/RedisPanel';
import type { NodeStatus } from '../../server/types/index.js';

type TabType = 'node' | 'redis';

const REFRESH_INTERVAL = 5000;

function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('node');
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error('Failed to fetch node status');
        const data = await response.json();
        setStatus(data);
        setError(null);
        setLastUpdate(Date.now());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          <p className="mt-4 text-gray-400 text-sm">Loading node status…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md">
          <h2 className="text-lg font-bold text-red-400 mb-2">Connection Error</h2>
          <p className="text-gray-300 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-xl font-bold text-white">Loggie OS Node Dashboard</h1>
              {status && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {status.system.hostname} · {status.system.user}@{status.system.network.ipAddress}
                  {' · '}uptime {formatUptime(status.system.uptime)}
                </p>
              )}
            </div>
            <LastUpdateIndicator lastUpdate={lastUpdate} />
          </div>
          <div className="flex gap-1 -mb-px">
            <TabButton active={activeTab === 'node'} onClick={() => setActiveTab('node')}>
              Node Status
            </TabButton>
            <TabButton active={activeTab === 'redis'} onClick={() => setActiveTab('redis')}>
              Redis
            </TabButton>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {activeTab === 'node' && <Dashboard status={status} />}
        {activeTab === 'redis' && <RedisPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-gray-900 text-white border-t border-x border-gray-700 rounded-t'
          : 'text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function LastUpdateIndicator({ lastUpdate }: { lastUpdate: number }) {
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    const update = () => {
      const s = Math.floor((Date.now() - lastUpdate) / 1000);
      setTimeAgo(s < 10 ? 'just now' : `${s}s ago`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-700/50">
      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-xs text-gray-300">Updated {timeAgo}</span>
    </div>
  );
}

export default App;
