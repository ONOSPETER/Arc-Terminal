import grpc from '@grpc/grpc-js';
import { GrpcTypes } from '@mysten/sui/grpc';
import { CHAINS } from '../../shared/chains.js';
import { makeRpc, rpcUrl } from './tatum.js';

const SUI_GRPC_TARGET = 'sui-mainnet-grpc.gateway.tatum.io:443';
const fieldMask = (paths) => ({ paths });
const unary = (path, request, response) => ({
  path,
  requestStream: false,
  responseStream: false,
  requestSerialize: (value) => Buffer.from(request.toBinary(value)),
  responseDeserialize: (value) => response.fromBinary(value),
});

const LedgerService = grpc.makeGenericClientConstructor({
  getServiceInfo: unary(
    '/sui.rpc.v2.LedgerService/GetServiceInfo',
    GrpcTypes.GetServiceInfoRequest,
    GrpcTypes.GetServiceInfoResponse,
  ),
  getCheckpoint: unary(
    '/sui.rpc.v2.LedgerService/GetCheckpoint',
    GrpcTypes.GetCheckpointRequest,
    GrpcTypes.GetCheckpointResponse,
  ),
  getEpoch: unary(
    '/sui.rpc.v2.LedgerService/GetEpoch',
    GrpcTypes.GetEpochRequest,
    GrpcTypes.GetEpochResponse,
  ),
}, 'LedgerService');

function callUnary(client, method, request, metadata) {
  return new Promise((resolve, reject) => {
    client[method](request, metadata, { deadline: new Date(Date.now() + 12_000) }, (error, result) => {
      if (error) reject(new Error(`Tatum Sui gRPC ${method}: ${error.details || error.message}`));
      else resolve(result);
    });
  });
}

function timestampSeconds(value) {
  if (!value) return null;
  return Number(value.seconds || 0) + Number(value.nanos || 0) / 1e9;
}

async function suiSnapshot() {
  const apiKey = process.env.TATUM_API_KEY;
  if (!apiKey) throw new Error('Add TATUM_API_KEY in Replit Secrets to connect to Sui.');

  const client = new LedgerService(SUI_GRPC_TARGET, grpc.credentials.createSsl());
  const metadata = new grpc.Metadata();
  metadata.add('x-api-key', apiKey);
  try {
    const service = await callUnary(client, 'getServiceInfo', {}, metadata);
    if (service.checkpointHeight === undefined) throw new Error('Tatum Sui gRPC did not return a checkpoint height.');

    const height = BigInt(service.checkpointHeight);
    const epochNumber = service.epoch === undefined ? undefined : BigInt(service.epoch);
    const currentRequest = {
      checkpointId: { oneofKind: 'sequenceNumber', sequenceNumber: height },
      readMask: fieldMask(['sequence_number', 'summary.total_network_transactions', 'summary.timestamp']),
    };
    const previousRequest = height >= 30n ? {
      checkpointId: { oneofKind: 'sequenceNumber', sequenceNumber: height - 30n },
      readMask: fieldMask(['sequence_number', 'summary.total_network_transactions', 'summary.timestamp']),
    } : null;
    const requests = [
      callUnary(client, 'getCheckpoint', currentRequest, metadata),
      callUnary(client, 'getEpoch', {
        ...(epochNumber === undefined ? {} : { epoch: epochNumber }),
        readMask: fieldMask(['epoch', 'reference_gas_price']),
      }, metadata),
    ];
    if (previousRequest) requests.push(callUnary(client, 'getCheckpoint', previousRequest, metadata));
    const [currentResult, epochResult, previousResult] = await Promise.all(requests);
    const current = currentResult.checkpoint;
    if (!current) throw new Error('Tatum Sui gRPC returned no latest checkpoint.');

    const total = current.summary?.totalNetworkTransactions;
    const previous = previousResult?.checkpoint?.summary;
    const currentTs = timestampSeconds(current.summary?.timestamp) ?? timestampSeconds(service.timestamp);
    const previousTs = timestampSeconds(previous?.timestamp);
    const txDelta = total !== undefined && previous?.totalNetworkTransactions !== undefined
      ? Number(total - previous.totalNetworkTransactions)
      : null;
    const txPerSecond = txDelta !== null && currentTs && previousTs && currentTs > previousTs
      ? txDelta / (currentTs - previousTs)
      : null;

    return {
      chain: 'sui',
      label: CHAINS.sui.label,
      kind: 'sui',
      ok: true,
      gateway: `https://${SUI_GRPC_TARGET.replace(':443', '')}`,
      height: String(height),
      heightLabel: 'Latest checkpoint',
      epoch: epochNumber === undefined ? null : String(epochNumber),
      observedAt: currentTs ? new Date(currentTs * 1000).toISOString() : null,
      totalNetworkTransactions: total === undefined ? null : String(total),
      transactionsPerSecond: txPerSecond === null ? null : Number(txPerSecond.toFixed(2)),
      referenceGasPriceMist: epochResult.epoch?.referenceGasPrice === undefined
        ? null
        : String(epochResult.epoch.referenceGasPrice),
    };
  } finally {
    client.close();
  }
}

async function solanaRpc(method, params = []) {
  const res = await fetch(rpcUrl('solana'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.TATUM_API_KEY || '' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('Tatum rejected the API key for Solana. Check plan access.');
  if (!res.ok) throw new Error(`Tatum Solana RPC returned HTTP ${res.status}.`);
  const json = await res.json();
  if (json.error) throw new Error(`Solana RPC ${method}: ${json.error.message || 'request failed'}`);
  return json.result;
}

async function solanaSnapshot() {
  const [slot, samples] = await Promise.all([
    solanaRpc('getSlot', [{ commitment: 'confirmed' }]),
    solanaRpc('getRecentPerformanceSamples', [5]),
  ]);
  const sample = Array.isArray(samples) ? samples[0] : null;
  const transactionsPerSecond = sample?.samplePeriodSecs
    ? Number((sample.numTransactions / sample.samplePeriodSecs).toFixed(2))
    : null;
  return {
    chain: 'solana',
    label: CHAINS.solana.label,
    kind: 'solana',
    ok: true,
    gateway: rpcUrl('solana'),
    height: String(slot),
    heightLabel: 'Confirmed slot',
    epoch: null,
    observedAt: new Date().toISOString(),
    transactionsPerSecond,
    samplePeriodSeconds: sample?.samplePeriodSecs ?? null,
  };
}

async function evmSnapshot(chain) {
  const rpc = makeRpc(chain);
  const block = await rpc.latest();
  return {
    chain,
    label: CHAINS[chain].label,
    kind: 'evm',
    ok: true,
    gateway: rpc.url,
    height: String(block.number),
    heightLabel: 'Latest block',
    epoch: null,
    observedAt: new Date(block.timestamp * 1000).toISOString(),
    transactionsPerBlock: block.txCount,
    baseFeeGwei: block.baseFeeGwei === null ? null : Number(block.baseFeeGwei.toFixed(3)),
    gasUtilizationPercent: block.gasLimit ? Number((100 * block.gasUsed / block.gasLimit).toFixed(1)) : null,
  };
}

export async function getNetworkSnapshot(chain) {
  try {
    if (!process.env.TATUM_API_KEY) throw new Error('Add TATUM_API_KEY in Replit Secrets to connect.');
    if (chain === 'sui') return await suiSnapshot();
    if (chain === 'solana') return await solanaSnapshot();
    return await evmSnapshot(chain);
  } catch (error) {
    return {
      chain,
      label: CHAINS[chain].label,
      kind: CHAINS[chain].kind,
      ok: false,
      gateway: CHAINS[chain].kind === 'sui' ? `https://${SUI_GRPC_TARGET.replace(':443', '')}` : rpcUrl(chain),
      error: String(error.message || error).slice(0, 180),
    };
  }
}
