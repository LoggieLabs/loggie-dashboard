export interface GethSyncStatus {
  syncing: boolean;
  currentBlock: string;
  highestBlock: string;
  startingBlock: string;
  pulledStates?: string;
  knownStates?: string;
}

export interface GethPeerInfo {
  count: number;
}

export interface GethVersion {
  version: string;
}

export interface LighthouseSyncStatus {
  is_syncing: boolean;
  is_optimistic: boolean;
  el_offline: boolean;
  head_slot: string;
  sync_distance: string;
}

export interface LighthouseHealth {
  status: number;
}

export interface LighthousePeers {
  meta: {
    count: number;
  };
  data: Array<{
    peer_id: string;
    state: string;
    direction: string;
  }>;
}

export interface LighthouseVersion {
  version: string;
}

export interface SystemInfo {
  hostname: string;
  uptime: number;
  diskUsage: {
    total: number;
    used: number;
    available: number;
    percentUsed: number;
  };
  diskIO: {
    readKBps: number;
    writeKBps: number;
    readIOPS: number;
    writeIOPS: number;
    utilization: number;
    device: string;
  } | null;
  memory: {
    total: number;
    used: number;
    free: number;
    percentUsed: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  temperature: {
    cpu: number | null;
    status: 'normal' | 'warm' | 'hot' | 'critical' | 'unavailable';
  };
  network: {
    ipAddress: string;
  };
}

export interface IpfsBandwidth {
  TotalIn: number;
  TotalOut: number;
  RateIn: number;
  RateOut: number;
}

export interface IpfsSwarmPeer {
  addr: string;
  peer: string;
}

export type IpfsStatus =
  | {
      available: true;
      peerId: string;
      agentVersion: string;
      addresses: string[];
      protocolCount: number;
      swarmPeers: number;
      swarmSample: IpfsSwarmPeer[];
      bandwidth: IpfsBandwidth;
      isPublicGateway: boolean;
    }
  | { available: false };

export interface NodeStatus {
  timestamp: number;
  geth?: {
    version: string;
    syncing: boolean;
    currentBlock: number;
    highestBlock: number;
    peers: number;
    syncProgress: number; // 0-100
  };
  lighthouse?: {
    version: string;
    syncing: boolean;
    headSlot: number;
    syncDistance: number;
    peers: number;
    isOptimistic: boolean;
  };
  ipfs?: IpfsStatus;
  system: SystemInfo;
}

export interface LogMessage {
  timestamp: string;
  service: 'geth' | 'lighthouse';
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}
