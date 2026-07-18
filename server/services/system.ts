import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs/promises';
import type { SystemInfo } from '../types/index.js';

const execAsync = promisify(exec);

// ── Disk I/O ──────────────────────────────────────────────────────────────────

interface DiskStats {
  timestamp: number;
  readsCompleted: number;
  sectorsRead: number;
  writesCompleted: number;
  sectorsWritten: number;
  ioTime: number;
}

let previousDiskStats: DiskStats | null = null;

async function getDiskIOStats() {
  try {
    const { stdout: dfOutput } = await execAsync("df / | tail -1 | awk '{print $1}'");
    const devicePath = dfOutput.trim();

    let resolvedPath = devicePath;
    try {
      const { stdout: real } = await execAsync(`readlink -f ${devicePath}`);
      resolvedPath = real.trim();
    } catch {
      // not a symlink
    }

    let deviceName = resolvedPath.replace('/dev/', '');
    if (!deviceName.startsWith('dm-') && deviceName.match(/[0-9]$/)) {
      deviceName = deviceName.replace(/p?[0-9]+$/, '');
    }

    const diskstatsContent = await fs.readFile('/proc/diskstats', 'utf-8');
    const deviceLine = diskstatsContent.trim().split('\n').find(line => {
      return line.trim().split(/\s+/)[2] === deviceName;
    });

    if (!deviceLine) {
      console.debug('Could not find device in /proc/diskstats:', deviceName);
      return null;
    }

    const parts = deviceLine.trim().split(/\s+/);
    const currentStats: DiskStats = {
      timestamp: Date.now(),
      readsCompleted: parseInt(parts[3]),
      sectorsRead: parseInt(parts[5]),
      writesCompleted: parseInt(parts[7]),
      sectorsWritten: parseInt(parts[9]),
      ioTime: parseInt(parts[12]),
    };

    if (!previousDiskStats) {
      previousDiskStats = currentStats;
      return { readKBps: 0, writeKBps: 0, readIOPS: 0, writeIOPS: 0, utilization: 0, device: deviceName };
    }

    const timeDiff = (currentStats.timestamp - previousDiskStats.timestamp) / 1000;
    if (timeDiff === 0) return { readKBps: 0, writeKBps: 0, readIOPS: 0, writeIOPS: 0, utilization: 0, device: deviceName };

    const readKBps = Math.round(((currentStats.sectorsRead - previousDiskStats.sectorsRead) * 512) / 1024 / timeDiff);
    const writeKBps = Math.round(((currentStats.sectorsWritten - previousDiskStats.sectorsWritten) * 512) / 1024 / timeDiff);
    const readIOPS = Math.round((currentStats.readsCompleted - previousDiskStats.readsCompleted) / timeDiff);
    const writeIOPS = Math.round((currentStats.writesCompleted - previousDiskStats.writesCompleted) / timeDiff);
    const utilization = Math.min(Math.round(((currentStats.ioTime - previousDiskStats.ioTime) / (timeDiff * 1000)) * 100), 100);

    previousDiskStats = currentStats;
    return { readKBps, writeKBps, readIOPS, writeIOPS, utilization, device: deviceName };
  } catch {
    return null;
  }
}

// ── Mounted drives ────────────────────────────────────────────────────────────

const SKIP_FSTYPES = new Set([
  'tmpfs', 'devtmpfs', 'devpts', 'sysfs', 'proc', 'cgroup', 'cgroup2',
  'pstore', 'securityfs', 'debugfs', 'tracefs', 'hugetlbfs', 'mqueue',
  'fusectl', 'fuse.portal', 'squashfs', 'overlay', 'ramfs', 'efivarfs',
  'bpf', 'autofs', 'configfs',
]);

async function getMountedDrives() {
  try {
    // -T includes fstype; columns: Filesystem Type Size Used Avail Use% Mounted
    const { stdout } = await execAsync("df -BG -T 2>/dev/null | tail -n +2");
    const drives: SystemInfo['drives'] = [];

    for (const line of stdout.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) continue;
      const [source, fstype, size, used, avail, pcent, ...mountParts] = parts;
      const mountpoint = mountParts.join(' ');

      if (SKIP_FSTYPES.has(fstype)) continue;
      if (source.startsWith('tmpfs') || source === 'none' || source === 'udev') continue;

      const toGB = (s: string) => parseInt(s.replace('G', '')) || 0;

      drives.push({
        device: source,
        mountpoint,
        fstype,
        total: toGB(size),
        used: toGB(used),
        available: toGB(avail),
        percentUsed: parseInt(pcent.replace('%', '')) || 0,
      });
    }

    return drives;
  } catch {
    return [];
  }
}

// ── Network I/O ───────────────────────────────────────────────────────────────

interface NetStats {
  timestamp: number;
  ifaces: Record<string, { rx: number; tx: number }>;
}

let previousNetStats: NetStats | null = null;

// Tag an interface as ethernet/wireless/other. sysfs is the reliable signal on
// Linux (wireless NICs expose /sys/class/net/<name>/wireless); fall back to the
// predictable-name convention (en*/eth* = wired, wl* = wireless).
async function ifaceKind(name: string): Promise<'ethernet' | 'wireless' | 'other'> {
  try {
    await fs.access(`/sys/class/net/${name}/wireless`);
    return 'wireless';
  } catch {}
  if (/^(wl|wlan|wlp|wlx)/.test(name)) return 'wireless';
  if (/^(en|eth|eno|enp|ens|end|enx)/.test(name)) return 'ethernet';
  return 'other';
}

type RawIface = { name: string; rxKBps: number; txKBps: number; rxBytes: number; txBytes: number };

async function enrichIfaces(ifaces: RawIface[]) {
  const nets = os.networkInterfaces();
  return Promise.all(ifaces.map(async (i) => {
    const v4 = (nets[i.name] || []).find((a) => a.family === 'IPv4' && !a.internal);
    return { ...i, address: v4?.address ?? null, kind: await ifaceKind(i.name) };
  }));
}

async function getNetworkIO() {
  try {
    const raw = await fs.readFile('/proc/net/dev', 'utf-8');
    const now = Date.now();
    const current: Record<string, { rx: number; tx: number }> = {};

    for (const line of raw.split('\n').slice(2)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const iface = trimmed.slice(0, colonIdx).trim();
      if (iface === 'lo') continue;
      const nums = trimmed.slice(colonIdx + 1).trim().split(/\s+/);
      current[iface] = { rx: parseInt(nums[0] ?? '0'), tx: parseInt(nums[8] ?? '0') };
    }

    if (!previousNetStats) {
      previousNetStats = { timestamp: now, ifaces: current };
      return enrichIfaces(Object.keys(current).map(name => ({ name, rxKBps: 0, txKBps: 0, rxBytes: current[name].rx, txBytes: current[name].tx })));
    }

    const timeDiff = (now - previousNetStats.timestamp) / 1000;
    const result = Object.entries(current).map(([name, cur]) => {
      const prev = previousNetStats!.ifaces[name] ?? cur;
      const rxKBps = timeDiff > 0 ? Math.round((cur.rx - prev.rx) / 1024 / timeDiff) : 0;
      const txKBps = timeDiff > 0 ? Math.round((cur.tx - prev.tx) / 1024 / timeDiff) : 0;
      return { name, rxKBps: Math.max(0, rxKBps), txKBps: Math.max(0, txKBps), rxBytes: cur.rx, txBytes: cur.tx };
    });

    previousNetStats = { timestamp: now, ifaces: current };
    return enrichIfaces(result);
  } catch {
    return [];
  }
}

// ── Services health ───────────────────────────────────────────────────────────

// System plumbing that's always running and not useful to display
const SERVICE_NOISE = new Set([
  'accounts-daemon', 'alsa-restore', 'alsa-state', 'anacron', 'apparmor',
  'apport', 'apt-daily', 'apt-daily-upgrade', 'avahi-daemon', 'bluetooth',
  'colord', 'console-setup', 'cron', 'cups', 'cups-browsed', 'dbus',
  'dmesg', 'dpkg-db-backup', 'e2scrub-all', 'e2scrub-reap', 'emergency',
  'fstrim', 'fwupd', 'fwupd-refresh', 'gdm', 'kerneloops', 'ModemManager',
  'networkd-dispatcher', 'NetworkManager', 'packagekit', 'polkit', 'rsyslog',
  'rtkit-daemon', 'snapd', 'speech-dispatcher', 'switcheroo-control',
  'thermald', 'udisks2', 'upower', 'whoopsie', 'wpa_supplicant',
  'ssh', 'sshd', 'containerd', 'plymouth', 'plymouth-quit', 'plymouth-quit-wait',
  'power-profiles-daemon', 'unattended-upgrades', 'irqbalance', 'multipathd',
]);
const NOISE_PREFIXES = [
  'systemd-', 'getty@', 'user@', 'session-', 'gnome-', 'at-spi-',
  'dconf', 'evolution-', 'gcr-', 'pipewire', 'pulseaudio', 'wireplumber',
  'gvfs-', 'xdg-', 'cloud-', 'filter-chain', 'snap.canonical-',
];

function isNoise(name: string) {
  return SERVICE_NOISE.has(name) || NOISE_PREFIXES.some(p => name.startsWith(p));
}

async function parseUnits(cmd: string) {
  try {
    const { stdout } = await execAsync(cmd);
    const services: Array<{ name: string; active: boolean; status: string }> = [];
    for (const line of stdout.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const unit = parts[0];
      if (!unit.endsWith('.service')) continue;
      const name = unit.replace('.service', '');
      const sub = parts[3]; // running | dead | exited | failed | ...
      if (sub !== 'running' && sub !== 'failed') continue;
      if (isNoise(name)) continue;
      services.push({ name, active: sub === 'running', status: sub });
    }
    return services;
  } catch {
    return [];
  }
}

async function getServicesHealth() {
  const [systemSvcs, userSvcs] = await Promise.all([
    parseUnits('systemctl list-units --type=service --state=active,failed --no-legend --no-pager --plain 2>/dev/null'),
    parseUnits('systemctl --user list-units --type=service --state=active,failed --no-legend --no-pager --plain 2>/dev/null'),
  ]);

  // Merge; system entries take precedence over user entries with same name
  const seen = new Set<string>();
  const result: Array<{ name: string; active: boolean; status: string }> = [];
  for (const s of [...systemSvcs, ...userSvcs]) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      result.push(s);
    }
  }

  // Force-include any MONITOR_SERVICES extras not already discovered
  const extra = (process.env.MONITOR_SERVICES ?? '').split(',').filter(Boolean);
  for (const name of extra) {
    if (seen.has(name)) continue;
    for (const cmd of [
      `systemctl is-active ${name} 2>/dev/null`,
      `systemctl --user is-active ${name} 2>/dev/null`,
    ]) {
      try {
        const { stdout } = await execAsync(cmd);
        const status = stdout.trim();
        if (status) { result.push({ name, active: status === 'active', status }); seen.add(name); break; }
      } catch { /* try next */ }
    }
    if (!seen.has(name)) result.push({ name, active: false, status: 'inactive' });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ── Top processes ─────────────────────────────────────────────────────────────

async function getTopProcesses() {
  try {
    const { stdout } = await execAsync(
      "ps aux --sort=-%cpu | awk 'NR>1 {print $1,$2,$3,$4,$6,$11}' | head -12"
    );
    return stdout.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/);
      const user = parts[0] ?? '';
      const pid = parseInt(parts[1] ?? '0');
      const cpu = parseFloat(parts[2] ?? '0');
      const memPercent = parseFloat(parts[3] ?? '0');
      const rssKB = parseInt(parts[4] ?? '0');
      const command = parts.slice(5).join(' ');
      const name = command.split('/').pop()?.split(' ')[0] ?? command;
      return { pid, user, cpu, memPercent, memMB: Math.round(rssKB / 1024), name, command };
    });
  } catch {
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getSystemInfo(): Promise<SystemInfo> {
  const hostname = os.hostname();
  const uptime = os.uptime();

  let diskUsage = { total: 0, used: 0, available: 0, percentUsed: 0 };
  try {
    const { stdout } = await execAsync("df -BG / | tail -1 | awk '{print $2,$3,$4,$5}'");
    const [total, used, available, percent] = stdout.trim().split(' ');
    diskUsage = {
      total: parseInt(total.replace('G', '')),
      used: parseInt(used.replace('G', '')),
      available: parseInt(available.replace('G', '')),
      percentUsed: parseInt(percent.replace('%', '')),
    };
  } catch {}

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memory = {
    total: Math.round(totalMem / (1024 * 1024 * 1024)),
    used: Math.round(usedMem / (1024 * 1024 * 1024)),
    free: Math.round(freeMem / (1024 * 1024 * 1024)),
    percentUsed: Math.round((usedMem / totalMem) * 100),
  };

  const loadAvg = os.loadavg();
  const cores = os.cpus().length;
  const cpu = {
    usage: Math.min(Math.round((loadAvg[0] / cores) * 100), 100),
    loadAverage: loadAvg,
    cores,
  };

  let temperature = {
    cpu: null as number | null,
    status: 'unavailable' as 'normal' | 'warm' | 'hot' | 'critical' | 'unavailable',
  };
  try {
    const { stdout } = await execAsync("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo '0'");
    const milliC = parseInt(stdout.trim());
    if (milliC > 0) {
      const c = milliC / 1000;
      temperature.cpu = Math.round(c);
      temperature.status = c < 60 ? 'normal' : c < 75 ? 'warm' : c < 85 ? 'hot' : 'critical';
    }
  } catch {}

  let ipAddress = 'unknown';
  try {
    const { stdout } = await execAsync("hostname -I | awk '{print $1}'");
    ipAddress = stdout.trim();
  } catch {}

  let user = 'unknown';
  try { user = os.userInfo().username; } catch {}

  const [diskIO, drives, networkIO, services, processes] = await Promise.all([
    getDiskIOStats(),
    getMountedDrives(),
    getNetworkIO(),
    getServicesHealth(),
    getTopProcesses(),
  ]);

  return {
    hostname,
    user,
    uptime,
    diskUsage,
    diskIO,
    drives,
    memory,
    cpu,
    temperature,
    network: { ipAddress, interfaces: networkIO },
    services,
    processes,
  };
}

export async function restartService(service: 'geth' | 'lighthouse'): Promise<void> {
  const serviceName = service === 'geth' ? 'geth-sepolia' : 'lighthouse-sepolia';
  try {
    await execAsync(`sudo systemctl restart ${serviceName}.service`);
  } catch {
    throw new Error(`Failed to restart ${service} service`);
  }
}

export async function getServiceStatus(service: 'geth' | 'lighthouse'): Promise<string> {
  const serviceName = service === 'geth' ? 'geth-sepolia' : 'lighthouse-sepolia';
  try {
    const { stdout } = await execAsync(`systemctl is-active ${serviceName}.service`);
    return stdout.trim();
  } catch {
    return 'inactive';
  }
}
