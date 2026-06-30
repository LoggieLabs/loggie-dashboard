import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs/promises';
import type { SystemInfo } from '../types/index.js';

const execAsync = promisify(exec);

// Store previous disk stats for calculating rates
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
    // Find the main disk device
    const { stdout: dfOutput } = await execAsync("df / | tail -1 | awk '{print $1}'");
    const devicePath = dfOutput.trim(); // e.g., /dev/sda1 or /dev/nvme0n1p1

    // Resolve symlinks (handles LVM: /dev/mapper/... → /dev/dm-0)
    let resolvedPath = devicePath;
    try {
      const { stdout: real } = await execAsync(`readlink -f ${devicePath}`);
      resolvedPath = real.trim();
    } catch {
      // not a symlink, use as-is
    }

    // Extract base device name (sda, nvme0n1, dm-0, etc.)
    let deviceName = resolvedPath.replace('/dev/', '');
    // Strip partition suffix from conventional devices (sda1 → sda, nvme0n1p3 → nvme0n1)
    // but NOT dm-* devices which have no partition suffix
    if (!deviceName.startsWith('dm-') && deviceName.match(/[0-9]$/)) {
      deviceName = deviceName.replace(/p?[0-9]+$/, '');
    }

    // Read /proc/diskstats
    const diskstatsContent = await fs.readFile('/proc/diskstats', 'utf-8');
    const lines = diskstatsContent.trim().split('\n');

    // Find the line for our device
    const deviceLine = lines.find(line => {
      const parts = line.trim().split(/\s+/);
      return parts[2] === deviceName;
    });

    if (!deviceLine) {
      console.debug('Could not find device in /proc/diskstats:', deviceName);
      return null;
    }

    const parts = deviceLine.trim().split(/\s+/);
    // Format: major minor device reads reads_merged sectors_read time_reading writes writes_merged sectors_written time_writing io_in_progress time_io weighted_time_io
    const currentStats: DiskStats = {
      timestamp: Date.now(),
      readsCompleted: parseInt(parts[3]),
      sectorsRead: parseInt(parts[5]),
      writesCompleted: parseInt(parts[7]),
      sectorsWritten: parseInt(parts[9]),
      ioTime: parseInt(parts[12]), // time spent doing I/Os (ms)
    };

    if (!previousDiskStats) {
      previousDiskStats = currentStats;
      return {
        readKBps: 0,
        writeKBps: 0,
        readIOPS: 0,
        writeIOPS: 0,
        utilization: 0,
        device: deviceName,
      };
    }

    // Calculate time difference in seconds
    const timeDiff = (currentStats.timestamp - previousDiskStats.timestamp) / 1000;

    if (timeDiff === 0) {
      return {
        readKBps: 0,
        writeKBps: 0,
        readIOPS: 0,
        writeIOPS: 0,
        utilization: 0,
        device: deviceName,
      };
    }

    // Each sector is 512 bytes
    const sectorsReadDiff = currentStats.sectorsRead - previousDiskStats.sectorsRead;
    const sectorsWrittenDiff = currentStats.sectorsWritten - previousDiskStats.sectorsWritten;
    const readsCompletedDiff = currentStats.readsCompleted - previousDiskStats.readsCompleted;
    const writesCompletedDiff = currentStats.writesCompleted - previousDiskStats.writesCompleted;
    const ioTimeDiff = currentStats.ioTime - previousDiskStats.ioTime;

    // Calculate rates
    const readKBps = Math.round((sectorsReadDiff * 512) / 1024 / timeDiff);
    const writeKBps = Math.round((sectorsWrittenDiff * 512) / 1024 / timeDiff);
    const readIOPS = Math.round(readsCompletedDiff / timeDiff);
    const writeIOPS = Math.round(writesCompletedDiff / timeDiff);

    // Utilization is percentage of time device was busy (ioTime is in ms)
    const utilization = Math.min(Math.round((ioTimeDiff / (timeDiff * 1000)) * 100), 100);

    // Update previous stats
    previousDiskStats = currentStats;

    return {
      readKBps,
      writeKBps,
      readIOPS,
      writeIOPS,
      utilization,
      device: deviceName,
    };
  } catch (error) {
    console.debug('Failed to get disk I/O stats:', error);
    return null;
  }
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const hostname = os.hostname();
  const uptime = os.uptime();

  // Get disk usage
  let diskUsage = {
    total: 0,
    used: 0,
    available: 0,
    percentUsed: 0,
  };

  try {
    const { stdout } = await execAsync("df -BG / | tail -1 | awk '{print $2,$3,$4,$5}'");
    const [total, used, available, percent] = stdout.trim().split(' ');
    diskUsage = {
      total: parseInt(total.replace('G', '')),
      used: parseInt(used.replace('G', '')),
      available: parseInt(available.replace('G', '')),
      percentUsed: parseInt(percent.replace('%', '')),
    };
  } catch (error) {
    console.error('Failed to get disk usage:', error);
  }

  // Get memory usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memory = {
    total: Math.round(totalMem / (1024 * 1024 * 1024)), // Convert to GB
    used: Math.round(usedMem / (1024 * 1024 * 1024)),
    free: Math.round(freeMem / (1024 * 1024 * 1024)),
    percentUsed: Math.round((usedMem / totalMem) * 100),
  };

  // Get CPU usage
  const loadAvg = os.loadavg();
  const cores = os.cpus().length;

  // Calculate CPU usage percentage based on 1-minute load average
  const cpuUsage = Math.min(Math.round((loadAvg[0] / cores) * 100), 100);

  const cpu = {
    usage: cpuUsage,
    loadAverage: loadAvg,
    cores,
  };

  // Get CPU temperature
  let temperature = {
    cpu: null as number | null,
    status: 'unavailable' as 'normal' | 'warm' | 'hot' | 'critical' | 'unavailable',
  };

  try {
    // Try to read CPU temperature from thermal zone (works on most Linux systems)
    const { stdout } = await execAsync("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo '0'");
    const tempMilliCelsius = parseInt(stdout.trim());

    if (tempMilliCelsius > 0) {
      const tempCelsius = tempMilliCelsius / 1000;
      temperature.cpu = Math.round(tempCelsius);

      // Determine temperature status
      if (tempCelsius < 60) {
        temperature.status = 'normal';
      } else if (tempCelsius < 75) {
        temperature.status = 'warm';
      } else if (tempCelsius < 85) {
        temperature.status = 'hot';
      } else {
        temperature.status = 'critical';
      }
    }
  } catch (error) {
    // Temperature unavailable - this is fine, not all systems support this
    console.debug('Temperature monitoring unavailable');
  }

  // Get disk I/O stats
  const diskIO = await getDiskIOStats();

  // Get IP address
  let ipAddress = 'unknown';
  try {
    const { stdout } = await execAsync("hostname -I | awk '{print $1}'");
    ipAddress = stdout.trim();
  } catch (error) {
    console.error('Failed to get IP address:', error);
  }

  return {
    hostname,
    uptime,
    diskUsage,
    diskIO,
    memory,
    cpu,
    temperature,
    network: {
      ipAddress,
    },
  };
}

export async function restartService(service: 'geth' | 'lighthouse'): Promise<void> {
  const serviceName = service === 'geth' ? 'geth-sepolia' : 'lighthouse-sepolia';
  try {
    await execAsync(`sudo systemctl restart ${serviceName}.service`);
  } catch (error) {
    console.error(`Failed to restart ${service}:`, error);
    throw new Error(`Failed to restart ${service} service`);
  }
}

export async function getServiceStatus(service: 'geth' | 'lighthouse'): Promise<string> {
  const serviceName = service === 'geth' ? 'geth-sepolia' : 'lighthouse-sepolia';
  try {
    const { stdout } = await execAsync(`systemctl is-active ${serviceName}.service`);
    return stdout.trim();
  } catch (error) {
    return 'inactive';
  }
}
