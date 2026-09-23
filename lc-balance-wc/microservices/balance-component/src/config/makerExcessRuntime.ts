import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadExcessPolicyConfig, resolveExcessPolicy } from './excessPolicyConfig';
import {
  createCurrencyExchangeAdapterConfig,
  createVirtualCurrencyExchangeAdapter,
  resolveConfiguredMaximumQuote,
  type CurrencyExchangePort,
  type VirtualCurrencyExchangeFetch,
} from '../integration/currencyExchange';
import type { BalanceMakerExcessRuntime } from '../service/balanceService';

export interface MakerExcessRuntimeOptions {
  env: NodeJS.ProcessEnv;
  policyJson?: string;
  providerPort?: CurrencyExchangePort;
  fetchImpl?: VirtualCurrencyExchangeFetch;
}

function positiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function loadPolicyJson(options: MakerExcessRuntimeOptions): string {
  if (options.policyJson !== undefined) return options.policyJson;
  const configuredPath = options.env.EXCESS_POLICY_CONFIG_PATH?.trim();
  if (!configuredPath) throw new Error('EXCESS_POLICY_CONFIG_PATH must identify the Excess policy configuration file.');
  return readFileSync(resolve(configuredPath), 'utf8');
}

/**
 * Builds the approved Maker Excess runtime at process startup.
 * Production deliberately has no implicit adapter: the provider implementation must be injected.
 */
export function createMakerExcessRuntime(options: MakerExcessRuntimeOptions): BalanceMakerExcessRuntime {
  const policies = loadExcessPolicyConfig(loadPolicyJson(options));
  const adapterConfig = createCurrencyExchangeAdapterConfig(options.env);
  const timeoutMs = positiveInteger(options.env.CURRENCY_EXCHANGE_TIMEOUT_MS, 'CURRENCY_EXCHANGE_TIMEOUT_MS');

  let providerPort: CurrencyExchangePort | undefined;
  let virtualEndpoint: string | undefined;
  if (adapterConfig.adapter === 'PROVIDER') {
    if (options.providerPort === undefined) throw new Error('Production Currency Exchange provider adapter must be supplied.');
    providerPort = options.providerPort;
  } else {
    virtualEndpoint = options.env.CURRENCY_EXCHANGE_ENDPOINT?.trim();
    if (!virtualEndpoint) throw new Error('CURRENCY_EXCHANGE_ENDPOINT is required for the Virtual Currency Exchange adapter.');
    // Validate the endpoint and the non-production boundary at startup, before accepting traffic.
    createVirtualCurrencyExchangeAdapter({
      config: adapterConfig,
      endpoint: virtualEndpoint,
      maxStalenessSeconds: policies[0]!.fxMaxStalenessSeconds,
      fetchImpl: options.fetchImpl,
    });
  }

  return {
    policy: {
      resolve: (ownerType, decisionTime) => resolveExcessPolicy(policies, ownerType, decisionTime),
    },
    fx: {
      async resolveConfiguredMaximum(input) {
        const port =
          providerPort ??
          createVirtualCurrencyExchangeAdapter({
            config: adapterConfig,
            endpoint: virtualEndpoint!,
            maxStalenessSeconds: input.maxStalenessSeconds,
            fetchImpl: options.fetchImpl,
          });
        return resolveConfiguredMaximumQuote(input.request, port, {
          commandIdempotencyKey: input.commandIdempotencyKey,
          maxStalenessSeconds: input.maxStalenessSeconds,
          environment: adapterConfig.environment,
          pbdAuthorization: input.pbdAuthorization,
          timeoutMs,
        });
      },
    },
  };
}
