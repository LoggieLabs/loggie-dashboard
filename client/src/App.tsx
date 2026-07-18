import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import RedisPanel from './pages/RedisPanel';
import type { NodeStatus } from '../../server/types/index.js';

type TabType = 'node' | 'redis';

const REFRESH_INTERVAL = 5000;

// Where the Loggie Node Hub lives (single instance, on WayneManor). Every
// node's dashboard links back here. Update if the hub host/IP changes.
const HUB_URL = 'http://192.168.1.174:8090';

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-[#212c38] border-t-loggie-400" />
          <p className="mt-4 text-gray-400 text-sm">Loading node status…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="panel max-w-md">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Can't reach this node</h2>
          <p className="text-gray-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-[1]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[#212c38] bg-[#0b1017]/80 backdrop-blur-md">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <NodeGlyph />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold leading-none text-white">
                    Loggie<span className="text-loggie-400"> OS</span>
                  </h1>
                  <span className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    Node
                  </span>
                </div>
                {status && (
                  <p className="mono mt-1 truncate text-xs text-gray-500">
                    {status.system.hostname} · {status.system.user}@{status.system.network.ipAddress} · up {formatUptime(status.system.uptime)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0">
              <LastUpdateIndicator lastUpdate={lastUpdate} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <TabButton active={activeTab === 'node'} onClick={() => setActiveTab('node')}>
                Node Status
              </TabButton>
              <TabButton active={activeTab === 'redis'} onClick={() => setActiveTab('redis')}>
                Redis
              </TabButton>
            </div>
            <a
              href={HUB_URL}
              title="Back to the Node Hub — all nodes on the network"
              className="mb-1 flex flex-shrink-0 items-center gap-2 self-center rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:border-[#212c38] hover:text-loggie-400"
            >
              <HubGlyph />
              <span className="hidden sm:inline">Node Hub</span>
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'node' && <Dashboard status={status} />}
        {activeTab === 'redis' && <RedisPanel />}
      </main>
    </div>
  );
}

function NodeGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" className="flex-shrink-0" aria-hidden="true">
      <circle cx="16" cy="16" r="9" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.5" />
      <circle cx="16" cy="16" r="4" fill="#38bdf8" />
      <g stroke="#38bdf8" strokeWidth="2" strokeLinecap="round">
        <line x1="16" y1="3" x2="16" y2="6" />
        <line x1="16" y1="26" x2="16" y2="29" />
        <line x1="3" y1="16" x2="6" y2="16" />
        <line x1="26" y1="16" x2="29" y2="16" />
      </g>
    </svg>
  );
}

// Hub = a cluster of nodes. Uses currentColor so it tints with the link.
function HubGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 32 32" className="flex-shrink-0" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeOpacity="0.7" strokeLinecap="round">
        <line x1="16" y1="16" x2="16" y2="6" />
        <line x1="16" y1="16" x2="26" y2="16" />
        <line x1="16" y1="16" x2="16" y2="26" />
        <line x1="16" y1="16" x2="6" y2="16" />
      </g>
      <g fill="currentColor">
        <circle cx="16" cy="6" r="2.6" />
        <circle cx="26" cy="16" r="2.6" />
        <circle cx="16" cy="26" r="2.6" />
        <circle cx="6" cy="16" r="2.6" />
        <circle cx="16" cy="16" r="4.4" />
      </g>
    </svg>
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
    <button onClick={onClick} className={`tab ${active ? 'tab-active' : ''}`}>
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
    <div className="inline-flex items-center gap-2 rounded-full border border-[#212c38] bg-[#131a23] px-3 py-1">
      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-xs text-gray-400">Updated {timeAgo}</span>
    </div>
  );
}

export default App;
