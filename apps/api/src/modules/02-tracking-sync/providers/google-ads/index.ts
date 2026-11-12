import type { IGoogleAdsClient } from './google-ads-client.interface';
import { GoogleAdsMockAdapter } from './google-ads-mock.adapter';
import { GoogleAdsApiAdapter } from './google-ads-api.adapter';

export * from './google-ads.types';
export * from './google-ads-client.interface';
export * from './google-ads-mock.adapter';
export * from './google-ads-api.adapter';
export * from './google-ads.normalizer';

export interface CreateGoogleAdsClientOptions {
  forceMock?: boolean;
  accountPropertyId?: string;
}

export function createGoogleAdsClient(options: CreateGoogleAdsClientOptions = {}): IGoogleAdsClient {
  const provider = (process.env.GOOGLE_ADS_PROVIDER || 'mock').trim().toLowerCase();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').trim();
  const clientId = (process.env.GOOGLE_ADS_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_ADS_CLIENT_SECRET || '').trim();
  const refreshToken = (process.env.GOOGLE_ADS_REFRESH_TOKEN || '').trim();
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').trim();

  if (options.forceMock || provider !== 'live' || !customerId || !clientId || !clientSecret || !refreshToken) {
    return new GoogleAdsMockAdapter(options.accountPropertyId || 'GADS-SYNTH-MOCK-01');
  }

  return new GoogleAdsApiAdapter({
    customerId,
    loginCustomerId: loginCustomerId || undefined,
    clientId,
    clientSecret,
    refreshToken,
  });
}
