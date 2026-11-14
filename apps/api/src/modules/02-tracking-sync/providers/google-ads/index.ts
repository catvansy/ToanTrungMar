import type { IGoogleAdsClient } from './google-ads-client.interface';
import { GoogleAdsMockAdapter } from './google-ads-mock.adapter';
import { GoogleAdsApiAdapter } from './google-ads-api.adapter';
import type { GoogleAdsConnectionInfoDto } from '@toantrung/contracts/02-tracking-sync';

export * from './google-ads.types';
export * from './google-ads-client.interface';
export * from './google-ads-mock.adapter';
export * from './google-ads-api.adapter';
export * from './google-ads.normalizer';

export interface CreateGoogleAdsClientOptions {
  forceMock?: boolean;
  accountPropertyId?: string;
}

function getOAuthCredentials() {
  const readFirstConfiguredValue = (...values: Array<string | undefined>) =>
    values.find((value) => Boolean(value?.trim()))?.trim() || '';

  return {
    clientId: readFirstConfiguredValue(
      process.env.GOOGLE_ADS_CLIENT_ID,
      process.env.GOOGLE_CLOUD_CLIENT_ID,
    ),
    clientSecret: readFirstConfiguredValue(
      process.env.GOOGLE_ADS_CLIENT_SECRET,
      process.env.GOOGLE_CLOUD_CLIENT_SECRET,
    ),
    refreshToken: readFirstConfiguredValue(
      process.env.GOOGLE_ADS_REFRESH_TOKEN,
      process.env.GOOGLE_CLOUD_REFRESH_TOKEN,
    ),
  };
}

export function createGoogleAdsClient(options: CreateGoogleAdsClientOptions = {}): IGoogleAdsClient {
  const provider = (process.env.GOOGLE_ADS_PROVIDER || 'live').trim().toLowerCase();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').trim();
  const { clientId, clientSecret, refreshToken } = getOAuthCredentials();
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').trim();
  const apiVersion = (process.env.GOOGLE_ADS_API_VERSION || 'v26').trim();

  if (options.forceMock || provider === 'mock') {
    return new GoogleAdsMockAdapter(options.accountPropertyId || 'GADS-SYNTH-MOCK-01');
  }

  if (provider !== 'live') {
    throw new Error('GOOGLE_ADS_PROVIDER chỉ chấp nhận "live" hoặc "mock".');
  }

  if (provider === 'live') {
    return new GoogleAdsApiAdapter({
      customerId,
      loginCustomerId: loginCustomerId || undefined,
      clientId,
      clientSecret,
      refreshToken,
      apiVersion,
    });
  }

  throw new Error('Không thể khởi tạo Google Ads provider.');
}

export async function checkGoogleAdsConnectionStatus(): Promise<GoogleAdsConnectionInfoDto> {
  const provider = (process.env.GOOGLE_ADS_PROVIDER || 'live').trim().toLowerCase();
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').trim();
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').trim();
  const { clientId, clientSecret, refreshToken } = getOAuthCredentials();
  const apiVersion = (process.env.GOOGLE_ADS_API_VERSION || 'v26').trim();
  const checkedAt = new Date().toISOString();

  if (provider === 'mock') {
    return {
      provider: 'mock',
      targetCustomerId: customerId || 'Chưa cấu hình',
      loginCustomerId: loginCustomerId || undefined,
      accountPropertyId: customerId ? `gads:${customerId.replace(/-/g, '')}` : 'none',
      apiVersion,
      isConnected: false,
      status: 'MOCK_ONLY',
      statusLabel: 'Đang dùng dữ liệu giả lập',
      message: 'GOOGLE_ADS_PROVIDER đang đặt là mock; chưa gọi Google Ads API thật.',
      checkedAt,
    };
  }

  const missingSettings: string[] = [];
  if (!/^\d{10}$/.test(customerId.replace(/-/g, ''))) {
    missingSettings.push('GOOGLE_ADS_CUSTOMER_ID (10 chữ số)');
  }
  if (!clientId) missingSettings.push('GOOGLE_ADS_CLIENT_ID / GOOGLE_CLOUD_CLIENT_ID');
  if (!clientSecret) missingSettings.push('GOOGLE_ADS_CLIENT_SECRET / GOOGLE_CLOUD_CLIENT_SECRET');
  if (!refreshToken) missingSettings.push('GOOGLE_ADS_REFRESH_TOKEN / GOOGLE_CLOUD_REFRESH_TOKEN');
  if (provider !== 'live') missingSettings.push('GOOGLE_ADS_PROVIDER (live hoặc mock)');

  if (missingSettings.length > 0) {
    return {
      provider: 'live',
      targetCustomerId: customerId || 'Chưa cấu hình',
      loginCustomerId: loginCustomerId || undefined,
      accountPropertyId: customerId ? `gads:${customerId.replace(/-/g, '')}` : 'none',
      apiVersion,
      isConnected: false,
      status: 'CONFIG_MISSING',
      statusLabel: 'Chưa cấu hình Google Ads',
      message: `Cấu hình Google Ads chưa hợp lệ: ${missingSettings.join(', ')}.`,
      checkedAt,
    };
  }

  const client = new GoogleAdsApiAdapter({
    customerId,
    loginCustomerId: loginCustomerId || undefined,
    clientId,
    clientSecret,
    refreshToken,
    apiVersion,
  });

  const health = await client.getHealthStatus();
  const healthMsg = health.message || '';
  let status: GoogleAdsConnectionInfoDto['status'] = health.ok ? 'CONNECTED' : 'API_ERROR';
  if (!health.ok) {
    if (healthMsg.includes('CUSTOMER_NOT_ENABLED')) {
      status = 'CUSTOMER_NOT_ENABLED';
    } else if (healthMsg.includes('CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION')) {
      status = 'TEST_ACCOUNT_REQUIRED';
    } else if (healthMsg.includes('OAuth') || healthMsg.includes('Token')) {
      status = 'AUTH_ERROR';
    }
  }

  let liveCampaigns: GoogleAdsConnectionInfoDto['liveCampaigns'] = undefined;
  if (health.ok) {
    try {
      liveCampaigns = await client.fetchLiveCampaignList();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        provider: 'live',
        targetCustomerId: customerId,
        loginCustomerId: loginCustomerId || undefined,
        accountPropertyId: client.accountPropertyId,
        apiVersion,
        isConnected: false,
        status: 'API_ERROR',
        statusLabel: 'Lỗi truy vấn Google Ads',
        message: `Xác thực thành công nhưng không lấy được danh sách chiến dịch: ${errorMessage}`,
        checkedAt,
      };
    }
  }

  return {
    provider: 'live',
    targetCustomerId: customerId,
    loginCustomerId: loginCustomerId || undefined,
    accountPropertyId: client.accountPropertyId,
    apiVersion,
    isConnected: health.ok,
    status,
    statusLabel: health.ok
      ? 'Đã kết nối trực tiếp (Live)'
      : status === 'CUSTOMER_NOT_ENABLED'
        ? 'Kết nối trực tiếp (Cần kích hoạt tài khoản)'
        : 'Lỗi kết nối trực tiếp',
    message: healthMsg || (health.ok ? 'Kết nối thành công.' : 'Kết nối thất bại.'),
    liveCampaigns,
    checkedAt,
  };
}

