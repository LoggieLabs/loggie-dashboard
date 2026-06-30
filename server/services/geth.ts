import fetch from 'node-fetch';
import type { GethSyncStatus, GethPeerInfo, GethVersion } from '../types/index.js';

const GETH_RPC = process.env.GETH_RPC || 'http://localhost:8545';

async function rpcCall(method: string, params: any[] = []): Promise<any> {
  try {
    const response = await fetch(GETH_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: any = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'RPC error');
    }

    return data.result;
  } catch (error) {
    console.error(`Geth RPC call failed (${method}):`, error);
    throw error;
  }
}

export async function getSyncStatus(): Promise<GethSyncStatus> {
  const result = await rpcCall('eth_syncing');

  if (result === false) {
    // Not syncing, get current block
    const currentBlock = await rpcCall('eth_blockNumber');
    return {
      syncing: false,
      currentBlock,
      highestBlock: currentBlock,
      startingBlock: currentBlock,
    };
  }

  return {
    syncing: true,
    currentBlock: result.currentBlock || '0x0',
    highestBlock: result.highestBlock || '0x0',
    startingBlock: result.startingBlock || '0x0',
    pulledStates: result.pulledStates,
    knownStates: result.knownStates,
  };
}

export async function getPeerCount(): Promise<GethPeerInfo> {
  const result = await rpcCall('net_peerCount');
  return {
    count: parseInt(result, 16),
  };
}

export async function getVersion(): Promise<GethVersion> {
  const result = await rpcCall('web3_clientVersion');
  return {
    version: result,
  };
}

export async function getBlockNumber(): Promise<number> {
  const result = await rpcCall('eth_blockNumber');
  return parseInt(result, 16);
}

export async function isHealthy(): Promise<boolean> {
  try {
    await rpcCall('web3_clientVersion');
    return true;
  } catch {
    return false;
  }
}
