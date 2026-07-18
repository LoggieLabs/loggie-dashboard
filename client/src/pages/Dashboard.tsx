import { useState, useEffect } from 'react';
import type { NodeStatus, IpfsStatus, ProcessInfo, DriveInfo, NetworkInterface, ServiceHealth, SpeedTestResult } from '../../../../server/types/index.js';

interface DashboardProps {
  status: NodeStatus | null;
}

function Dashboard({ status }: DashboardProps) {
  if (!status) return null;

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const getTemperatureColor = (s: string) => {
    switch (s) {
      case 'normal': return 'text-green-400';
      case 'warm': return 'text-yellow-400';
      case 'hot': return 'text-orange-400';
      case 'critical': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getUsageColor = (percent: number) => {
    if (percent < 60) return 'bg-green-500';
    if (percent < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatDataRate = (kbps: number) => {
    if (kbps < 1024) return `${kbps} KB/s`;
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const truncatePeerId = (id: string) =>
    id.length > 20 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id;

  return (
    <div className="space-y-6">
      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="CPU Usage">
          <div className="stat-value">{status.system.cpu.usage}%</div>
          <div className="stat-label">{status.system.cpu.cores} cores</div>
          <ProgressBar value={status.system.cpu.usage} color={getUsageColor(status.system.cpu.usage)} />
          <div className="mt-2 text-xs text-gray-500">
            Load: {status.system.cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}
          </div>
        </MetricCard>

        <MetricCard title="Memory">
          <div className="stat-value">{status.system.memory.percentUsed}%</div>
          <div className="stat-label">{status.system.memory.used}G / {status.system.memory.total}G used</div>
          <ProgressBar value={status.system.memory.percentUsed} color={getUsageColor(status.system.memory.percentUsed)} />
          <div className="mt-2 text-xs text-gray-500">{status.system.memory.free}G free</div>
        </MetricCard>

        <MetricCard title="Disk Usage">
          <div className="stat-value">{status.system.diskUsage.percentUsed}%</div>
          <div className="stat-label">{status.system.diskUsage.used}G / {status.system.diskUsage.total}G used</div>
          <ProgressBar value={status.system.diskUsage.percentUsed} color={getUsageColor(status.system.diskUsage.percentUsed)} />
          <div className="mt-2 text-xs text-gray-500">{status.system.diskUsage.available}G available</div>
        </MetricCard>

        <MetricCard title="Temperature">
          {status.system.temperature.cpu !== null ? (
            <>
              <div className={`stat-value ${getTemperatureColor(status.system.temperature.status)}`}>
                {status.system.temperature.cpu}°C
              </div>
              <div className="stat-label capitalize">{status.system.temperature.status}</div>
              <ProgressBar
                value={Math.min((status.system.temperature.cpu / 100) * 100, 100)}
                color={getUsageColor(Math.min((status.system.temperature.cpu / 100) * 100, 100))}
              />
            </>
          ) : (
            <>
              <div className="stat-value text-gray-500">N/A</div>
              <div className="stat-label">Unavailable</div>
            </>
          )}
        </MetricCard>
      </div>

      {/* Disk I/O */}
      {status.system.diskIO && (
        <div className="bg-gray-800/50 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Disk I/O — {status.system.diskIO.device}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <IOStat label="Read Speed" value={formatDataRate(status.system.diskIO.readKBps)} sub={`${status.system.diskIO.readIOPS} IOPS`} />
            <IOStat label="Write Speed" value={formatDataRate(status.system.diskIO.writeKBps)} sub={`${status.system.diskIO.writeIOPS} IOPS`} />
            <IOStat label="Total IOPS" value={(status.system.diskIO.readIOPS + status.system.diskIO.writeIOPS).toString()} sub="ops/sec" />
            <IOStat
              label="Utilization"
              value={`${status.system.diskIO.utilization}%`}
              sub={<ProgressBar value={status.system.diskIO.utilization} color={getUsageColor(status.system.diskIO.utilization)} />}
            />
            <IOStat
              label="Throughput"
              value={formatDataRate(status.system.diskIO.readKBps + status.system.diskIO.writeKBps)}
              sub="combined R/W"
            />
          </div>
        </div>
      )}

      {/* Services Health */}
      <ServicesStrip services={status.system.services} />

      {/* Mounted Drives */}
      <DrivesTable drives={status.system.drives} getUsageColor={getUsageColor} />

      {/* Network I/O */}
      <NetworkIO interfaces={status.system.network.interfaces} formatDataRate={formatDataRate} formatBytes={formatBytes} />

      {/* Internet Speed */}
      <SpeedTestSection initial={status.speedtest ?? null} />

      {/* Top Processes */}
      <ProcessTable processes={status.system.processes} />

      {/* IPFS */}
      <IpfsSection ipfs={status.ipfs} formatBytes={formatBytes} truncatePeerId={truncatePeerId} />

      {/* Ethereum Clients (only shown when available) */}
      {(status.geth || status.lighthouse) && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {status.geth && (
              <MetricCard title="Geth">
                <div className="flex items-center justify-between mb-1">
                  <div className="stat-value text-2xl">{formatNumber(status.geth.currentBlock)}</div>
                  <StatusBadge syncing={status.geth.syncing} />
                </div>
                <div className="stat-label">Current Block</div>
                <div className="mt-2 text-xs text-gray-500">{status.geth.peers} peers</div>
              </MetricCard>
            )}
            {status.lighthouse && (
              <MetricCard title="Lighthouse">
                <div className="flex items-center justify-between mb-1">
                  <div className="stat-value text-2xl">{formatNumber(status.lighthouse.headSlot)}</div>
                  <StatusBadge syncing={status.lighthouse.syncing} />
                </div>
                <div className="stat-label">Head Slot</div>
                <div className="mt-2 text-xs text-gray-500">
                  {status.lighthouse.peers} peers{status.lighthouse.isOptimistic ? ' · Optimistic' : ''}
                </div>
              </MetricCard>
            )}
            {(status.geth || status.lighthouse) && (
              <MetricCard title="Network Peers">
                <div className="stat-value">{(status.geth?.peers ?? 0) + (status.lighthouse?.peers ?? 0)}</div>
                <div className="stat-label">Total Peers</div>
                {status.geth && status.lighthouse && (
                  <div className="mt-2 text-xs text-gray-500">
                    Geth: {status.geth.peers} · Lighthouse: {status.lighthouse.peers}
                  </div>
                )}
              </MetricCard>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {status.geth && (
              <div className="bg-gray-800/50 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Geth Sync</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">Progress</span>
                      <span className="font-semibold text-white">{status.geth.syncProgress.toFixed(2)}%</span>
                    </div>
                    <ProgressBar value={Math.min(status.geth.syncProgress, 100)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500 mb-1">Current Block</div>
                      <div className="font-semibold text-white">{formatNumber(status.geth.currentBlock)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Highest Block</div>
                      <div className="font-semibold text-white">{formatNumber(status.geth.highestBlock)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">{status.geth.version}</div>
                </div>
              </div>
            )}
            {status.lighthouse && (
              <div className="bg-gray-800/50 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Lighthouse Sync</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500 mb-1">Head Slot</div>
                      <div className="font-semibold text-white">{formatNumber(status.lighthouse.headSlot)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-1">Sync Distance</div>
                      <div className="font-semibold text-white">{formatNumber(status.lighthouse.syncDistance)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">Mode:</span>
                    {status.lighthouse.isOptimistic
                      ? <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">Optimistic</span>
                      : <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">Verified</span>
                    }
                  </div>
                  <div className="text-xs text-gray-500">{status.lighthouse.version}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* System Info */}
      <div className="bg-gray-800/50 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">System Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <InfoField label="Hostname" value={status.system.hostname} />
          <InfoField label="User" value={status.system.user} />
          <InfoField label="IP Address" value={status.system.network.ipAddress} />
          <InfoField label="CPU Cores" value={`${status.system.cpu.cores} cores`} />
          <InfoField label="Total Memory" value={`${status.system.memory.total}G RAM`} />
        </div>
      </div>
    </div>
  );
}

function ServicesStrip({ services }: { services: ServiceHealth[] }) {
  if (!services || services.length === 0) return null;
  return (
    <div className="bg-gray-800/50 rounded-lg px-5 py-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Services</h3>
      <div className="flex flex-wrap gap-2">
        {services.map(s => (
          <div key={s.name} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
            s.active
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : s.status === 'failed'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-gray-700/40 border-gray-600/40 text-gray-500'
          }`}>
            <div className={`h-1.5 w-1.5 rounded-full ${
              s.active ? 'bg-green-500 animate-pulse' : s.status === 'failed' ? 'bg-red-500' : 'bg-gray-600'
            }`} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function DrivesTable({ drives, getUsageColor }: { drives: DriveInfo[]; getUsageColor: (n: number) => string }) {
  if (!drives || drives.length === 0) return null;
  return (
    <div className="bg-gray-800/50 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Storage</h3>
      <div className="space-y-3">
        {drives.map((d, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-sm mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white font-medium truncate">{d.mountpoint}</span>
                <span className="text-gray-600 text-xs flex-shrink-0">{d.fstype}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4 text-xs text-gray-400">
                <span>{d.used}G / {d.total}G</span>
                <span className={`font-semibold ${d.percentUsed > 80 ? 'text-red-400' : d.percentUsed > 60 ? 'text-yellow-400' : 'text-gray-300'}`}>
                  {d.percentUsed}%
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getUsageColor(d.percentUsed)}`}
                style={{ width: `${Math.min(d.percentUsed, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-600 mt-0.5">{d.device} · {d.available}G free</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkIO({ interfaces, formatDataRate, formatBytes }: {
  interfaces: NetworkInterface[];
  formatDataRate: (kbps: number) => string;
  formatBytes: (bytes: number) => string;
}) {
  const active = interfaces.filter(i => i.rxBytes > 0 || i.txBytes > 0);
  if (active.length === 0) return null;
  return (
    <div className="bg-gray-800/50 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Network I/O</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {active.map(iface => (
          <div key={iface.name} className="bg-gray-900/40 rounded-lg p-3">
            <div className="text-sm font-semibold text-white mb-2">{iface.name}</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">↓ In</div>
                <div className="text-sm font-mono text-green-400">{formatDataRate(iface.rxKBps)}</div>
                <div className="text-xs text-gray-600">{formatBytes(iface.rxBytes)} total</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">↑ Out</div>
                <div className="text-sm font-mono text-blue-400">{formatDataRate(iface.txKBps)}</div>
                <div className="text-xs text-gray-600">{formatBytes(iface.txBytes)} total</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessTable({ processes }: { processes: ProcessInfo[] }) {
  if (!processes || processes.length === 0) return null;

  const getCpuColor = (cpu: number) => {
    if (cpu > 50) return 'text-red-400';
    if (cpu > 20) return 'text-yellow-400';
    return 'text-gray-300';
  };

  const getMemColor = (mem: number) => {
    if (mem > 20) return 'text-red-400';
    if (mem > 10) return 'text-yellow-400';
    return 'text-gray-300';
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
        Active Processes
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-700">
              <th className="text-left pb-2 font-medium">Process</th>
              <th className="text-left pb-2 font-medium">User</th>
              <th className="text-right pb-2 font-medium w-16">PID</th>
              <th className="text-right pb-2 font-medium w-16">CPU%</th>
              <th className="text-right pb-2 font-medium w-16">MEM%</th>
              <th className="text-right pb-2 font-medium w-20">RSS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {processes.map((p, i) => (
              <tr key={i} className="hover:bg-gray-700/20 transition-colors">
                <td className="py-1.5 pr-4">
                  <span className="text-white font-medium truncate block max-w-xs" title={p.command}>
                    {p.name}
                  </span>
                </td>
                <td className="py-1.5 pr-4 text-gray-400">{p.user}</td>
                <td className="py-1.5 text-right text-gray-500 font-mono">{p.pid}</td>
                <td className={`py-1.5 text-right font-mono font-medium ${getCpuColor(p.cpu)}`}>
                  {p.cpu.toFixed(1)}
                </td>
                <td className={`py-1.5 text-right font-mono font-medium ${getMemColor(p.memPercent)}`}>
                  {p.memPercent.toFixed(1)}
                </td>
                <td className="py-1.5 text-right text-gray-400 font-mono">
                  {p.memMB > 1024 ? `${(p.memMB / 1024).toFixed(1)}G` : `${p.memMB}M`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IpfsSection({
  ipfs,
  formatBytes,
  truncatePeerId,
}: {
  ipfs: IpfsStatus | undefined;
  formatBytes: (b: number) => string;
  truncatePeerId: (id: string) => string;
}) {
  if (!ipfs) return null;

  if (!ipfs.available) {
    return (
      <div className="bg-gray-800/30 rounded-lg p-5 flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-gray-600" />
        <span className="text-sm text-gray-500">IPFS not available on this node</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">IPFS Network</h3>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            ipfs.isPublicGateway
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-gray-600/40 text-gray-400'
          }`}>
            {ipfs.isPublicGateway ? 'Public Gateway' : 'Private Node'}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-400">Online</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Identity */}
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Peer ID</div>
            <div className="font-mono text-sm text-white truncate" title={ipfs.peerId}>
              {truncatePeerId(ipfs.peerId)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Agent</div>
            <div className="text-sm text-white">{ipfs.agentVersion}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Protocols</div>
            <div className="text-sm text-white">{ipfs.protocolCount} supported</div>
          </div>
        </div>

        {/* Swarm */}
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Swarm Peers</div>
            <div className="text-2xl font-bold text-white">{ipfs.swarmPeers}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Listen Addresses</div>
            <div className="space-y-1">
              {ipfs.addresses.slice(0, 3).map((addr, i) => (
                <div key={i} className="font-mono text-xs text-gray-300 truncate" title={addr}>
                  {addr}
                </div>
              ))}
              {ipfs.addresses.length > 3 && (
                <div className="text-xs text-gray-500">+{ipfs.addresses.length - 3} more</div>
              )}
            </div>
          </div>
        </div>

        {/* Bandwidth */}
        <div className="space-y-3">
          <div className="text-xs text-gray-500 mb-1">Bandwidth</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900/40 rounded p-2">
              <div className="text-xs text-gray-500">Rate In</div>
              <div className="text-sm font-semibold text-green-400">
                {formatBytes(Math.round(ipfs.bandwidth.RateIn))}/s
              </div>
            </div>
            <div className="bg-gray-900/40 rounded p-2">
              <div className="text-xs text-gray-500">Rate Out</div>
              <div className="text-sm font-semibold text-blue-400">
                {formatBytes(Math.round(ipfs.bandwidth.RateOut))}/s
              </div>
            </div>
            <div className="bg-gray-900/40 rounded p-2">
              <div className="text-xs text-gray-500">Total In</div>
              <div className="text-sm font-semibold text-white">{formatBytes(ipfs.bandwidth.TotalIn)}</div>
            </div>
            <div className="bg-gray-900/40 rounded p-2">
              <div className="text-xs text-gray-500">Total Out</div>
              <div className="text-sm font-semibold text-white">{formatBytes(ipfs.bandwidth.TotalOut)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Swarm sample peers */}
      {ipfs.swarmSample.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-700/50">
          <div className="text-xs text-gray-500 mb-2">Connected Peers (sample)</div>
          <div className="space-y-1">
            {ipfs.swarmSample.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500/60 flex-shrink-0" />
                <span className="truncate">{p.addr}/p2p/{p.peer.slice(0, 16)}…</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpeedTestSection({ initial }: { initial: SpeedTestResult | null }) {
  const [result, setResult] = useState<SpeedTestResult | null>(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adopt newer results from the polled status, unless a manual run is in flight.
  useEffect(() => {
    if (running) return;
    if (initial && (!result || initial.testedAt > result.testedAt)) {
      setResult(initial);
    }
  }, [initial, running, result]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/speedtest/run', { method: 'POST' });
      const data = await res.json();
      if (data.lastResult) setResult(data.lastResult);
      if (!res.ok) setError(data.lastError || `Speed test failed (HTTP ${res.status})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speed test failed');
    } finally {
      setRunning(false);
    }
  };

  const testedAgo = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Internet Speed</h3>
        <div className="flex items-center gap-3">
          {result && !running && (
            <span className="text-xs text-gray-500">tested {testedAgo(result.testedAt)}</span>
          )}
          <button
            onClick={run}
            disabled={running}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              running
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {running && <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />}
            {running ? 'Testing…' : 'Run test'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {result ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SpeedStat label="Download" value={result.downloadMbps} unit="Mbps" color="text-green-400" />
            <SpeedStat label="Upload" value={result.uploadMbps} unit="Mbps" color="text-blue-400" />
            <SpeedStat label="Ping" value={result.pingMs} unit="ms" color="text-white" />
            <SpeedStat label="Jitter" value={result.jitterMs} unit="ms" color="text-gray-300" />
          </div>
          <div className="mt-3 text-xs text-gray-600">
            via {result.server} · {(result.durationMs / 1000).toFixed(1)}s
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-500">
          {running ? 'Measuring download, upload, and latency…' : 'No reading yet — run a test.'}
        </div>
      )}
    </div>
  );
}

function SpeedStat({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="bg-gray-900/40 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>
        {value}
        <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
      </div>
    </div>
  );
}

function MetricCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ProgressBar({ value, color = 'bg-blue-500' }: { value: number; color?: string }) {
  return (
    <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

function StatusBadge({ syncing }: { syncing: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
      syncing ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
    }`}>
      {syncing ? 'Syncing' : 'Synced'}
    </span>
  );
}

function IOStat({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{sub}</div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-gray-500 mb-1">{label}</div>
      <div className="font-semibold text-white">{value}</div>
    </div>
  );
}

export default Dashboard;
