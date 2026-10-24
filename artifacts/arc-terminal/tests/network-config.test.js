import test from 'node:test';
import assert from 'node:assert/strict';
import { GrpcTypes } from '@mysten/sui/grpc';
import { CHAINS, FORECAST_CHAINS } from '../shared/chains.js';
import { pickForecastChain } from '../api/_lib/engine.js';

test('the app exposes only Sui, Ethereum, Solana, and Base', () => {
  assert.deepEqual(Object.keys(CHAINS), ['sui', 'ethereum', 'solana', 'base']);
  assert.deepEqual(FORECAST_CHAINS, ['ethereum', 'base']);
});

test('forecast actions only accept Ethereum and Base', () => {
  assert.equal(pickForecastChain('ethereum'), 'ethereum');
  assert.equal(pickForecastChain('base'), 'base');
  assert.throws(() => pickForecastChain('sui'), /Sui and Solana are available for live network monitoring/);
  assert.throws(() => pickForecastChain('solana'), /Sui and Solana are available for live network monitoring/);
});

test('Sui gRPC checkpoint requests serialize the typed sequence and field mask', () => {
  const request = {
    checkpointId: { oneofKind: 'sequenceNumber', sequenceNumber: 123n },
    readMask: { paths: ['sequence_number', 'summary.timestamp'] },
  };
  const decoded = GrpcTypes.GetCheckpointRequest.fromBinary(
    GrpcTypes.GetCheckpointRequest.toBinary(request),
  );
  assert.equal(decoded.checkpointId.sequenceNumber, 123n);
  assert.deepEqual(decoded.readMask.paths, request.readMask.paths);
});
