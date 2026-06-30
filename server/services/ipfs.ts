import fetch from 'node-fetch';

const IPFS_API = process.env.IPFS_API || 'http://127.0.0.1:5001';
export const IPFS_ENABLED = process.env.ENABLE_IPFS !== 'false';

async function apiPost<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${IPFS_API}/api/v0${endpoint}`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`IPFS API ${endpoint} returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getStatus() {
  if (!IPFS_ENABLED) return { available: false as const };
  try {
    const [nodeId, swarmResult, bw] = await Promise.all([
      apiPost<{
        ID: string;
        PublicKey: string;
        Addresses: string[];
        AgentVersion: string;
        Protocols: string[];
      }>('/id'),
      apiPost<{ Peers: Array<{ Addr: string; Peer: string }> | null }>('/swarm/peers'),
      apiPost<{ TotalIn: number; TotalOut: number; RateIn: number; RateOut: number }>('/stats/bw'),
    ]);

    const peers = swarmResult.Peers ?? [];

    // Check if gateway is publicly bound by inspecting config
    let isPublicGateway = false;
    try {
      const config = await apiPost<any>('/config/show');
      const gateway: string = config?.Addresses?.Gateway ?? '';
      isPublicGateway = gateway.includes('0.0.0.0');
    } catch {
      // config unavailable — leave as false
    }

    return {
      available: true as const,
      peerId: nodeId.ID,
      agentVersion: nodeId.AgentVersion,
      addresses: nodeId.Addresses.filter(a => !a.startsWith('/ip4/127') && !a.startsWith('/ip6/::1')),
      protocolCount: nodeId.Protocols.length,
      swarmPeers: peers.length,
      swarmSample: peers.slice(0, 5).map(p => ({ addr: p.Addr, peer: p.Peer })),
      bandwidth: bw,
      isPublicGateway,
    };
  } catch {
    return { available: false as const };
  }
}

export type IpfsStatus = Awaited<ReturnType<typeof getStatus>>;
