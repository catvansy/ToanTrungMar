'use strict';

const DEFAULT_PAGE_SIZE = 100000;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API_URL = 'https://analyticsdata.googleapis.com/v1beta';

class GoogleAnalyticsConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleAnalyticsConfigurationError';
  }
}

class GoogleAnalyticsApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleAnalyticsApiError';
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   isConfigured: boolean;
 *   isConnected: boolean;
 *   status: 'CONFIG_MISSING' | 'CONFIGURED_NOT_CHECKED';
 *   statusLabel: string;
 *   message: string;
 *   checkedAt: string;
 * }}
 */
function getGoogleAnalyticsConfigurationStatus(env = process.env) {
  const missingSettings = [];
  const propertyId = (env.GOOGLE_ANALYTICS_API_ID || '').trim();
  const credentials = getOAuthCredentials(env);

  if (!/^\d+$/.test(propertyId)) missingSettings.push('GOOGLE_ANALYTICS_API_ID');
  if (!credentials.clientId) missingSettings.push('GOOGLE_CLOUD_CLIENT_ID');
  if (!credentials.clientSecret) missingSettings.push('GOOGLE_CLOUD_CLIENT_SECRET');
  if (!credentials.refreshToken) missingSettings.push('GOOGLE_CLOUD_REFRESH_TOKEN');

  return {
    isConfigured: missingSettings.length === 0,
    isConnected: false,
    status: missingSettings.length === 0 ? 'CONFIGURED_NOT_CHECKED' : 'CONFIG_MISSING',
    statusLabel:
      missingSettings.length === 0 ? 'Đã cấu hình, chưa kiểm tra API' : 'Chưa cấu hình OAuth GA4',
    message:
      missingSettings.length === 0
        ? 'Cấu hình đã đủ; quyền API sẽ được xác nhận khi đồng bộ.'
        : `Thiếu cấu hình: ${missingSettings.join(', ')}.`,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {typeof fetch} [fetchImpl]
 */
async function getGoogleAnalyticsConnectionStatus(env = process.env, fetchImpl = fetch) {
  const configuration = getGoogleAnalyticsConfigurationStatus(env);
  if (!configuration.isConfigured) return configuration;

  try {
    const adapter = new GoogleAnalyticsDataApiAdapter(
      {
        propertyId: env.GOOGLE_ANALYTICS_API_ID || '',
        ...getOAuthCredentials(env),
      },
      fetchImpl,
    );
    await adapter.checkConnection();
    return {
      ...configuration,
      isConnected: true,
      status: 'CONNECTED',
      statusLabel: 'Đã kết nối trực tiếp (Live)',
      message: 'OAuth và quyền truy vấn Google Analytics Property đã được xác nhận.',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...configuration,
      isConnected: false,
      status: 'API_ERROR',
      statusLabel: 'Không kết nối được GA4 LIVE',
      message: error instanceof Error ? error.message : 'Lỗi kiểm tra kết nối Google Analytics.',
      checkedAt: new Date().toISOString(),
    };
  }
}

function getOAuthCredentials(env) {
  return {
    clientId: readEnvironmentValue(
      env.GOOGLE_ANALYTICS_CLIENT_ID,
      env.GOOGLE_CLOUD_CLIENT_ID,
      env.GOOGLE_ADS_CLIENT_ID,
    ),
    clientSecret: readEnvironmentValue(
      env.GOOGLE_ANALYTICS_CLIENT_SECRET,
      env.GOOGLE_CLOUD_CLIENT_SECRET,
      env.GOOGLE_ADS_CLIENT_SECRET,
    ),
    refreshToken: readEnvironmentValue(
      env.GOOGLE_ANALYTICS_REFRESH_TOKEN,
      env.GOOGLE_CLOUD_REFRESH_TOKEN,
    ),
  };
}

function readEnvironmentValue(...values) {
  for (const value of values) {
    const trimmed = (value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

class GoogleAnalyticsDataApiAdapter {
  /**
   * @param {{
   *   propertyId: string;
   *   clientId: string;
   *   clientSecret: string;
   *   refreshToken: string;
   * }} config
   * @param {typeof fetch} fetchImpl
   */
  constructor(config, fetchImpl = fetch) {
    const propertyId = config.propertyId.trim();
    if (!/^\d+$/.test(propertyId)) {
      throw new GoogleAnalyticsConfigurationError(
        'GOOGLE_ANALYTICS_API_ID phải là GA4 Property ID dạng số.',
      );
    }

    const missing = [];
    if (!config.clientId.trim()) missing.push('GOOGLE_CLOUD_CLIENT_ID');
    if (!config.clientSecret.trim()) missing.push('GOOGLE_CLOUD_CLIENT_SECRET');
    if (!config.refreshToken.trim()) missing.push('GOOGLE_CLOUD_REFRESH_TOKEN');
    if (missing.length > 0) {
      throw new GoogleAnalyticsConfigurationError(
        `Thiếu cấu hình Google Analytics: ${missing.join(', ')}.`,
      );
    }

    this.propertyId = propertyId;
    this.accountPropertyId = propertyId;
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  static fromEnvironment(fetchImpl = fetch) {
    return new GoogleAnalyticsDataApiAdapter(
      {
        propertyId: process.env.GOOGLE_ANALYTICS_API_ID || '',
        ...getOAuthCredentials(process.env),
      },
      fetchImpl,
    );
  }

  async fetchPageMetrics({ startDate, endDate }) {
    if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
      throw new GoogleAnalyticsConfigurationError('Khoảng ngày GA4 không hợp lệ.');
    }

    const accessToken = await this.getAccessToken();
    const rows = [];
    let offset = 0;

    while (true) {
      const response = await this.fetchImpl(
        `${DATA_API_URL}/properties/${this.propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'date' }, { name: 'pagePath' }],
            metrics: [{ name: 'screenPageViews' }, { name: 'userEngagementDuration' }],
            limit: DEFAULT_PAGE_SIZE,
            offset,
          }),
        },
      );

      if (!response.ok) {
        throw new GoogleAnalyticsApiError(
          `Google Analytics Data API trả về HTTP ${response.status}. Kiểm tra quyền analytics.readonly và GA4 Property ID.`,
        );
      }

      const report = await parseJson(response, 'Google Analytics Data API');
      const pageRows = Array.isArray(report.rows) ? report.rows : [];
      for (const row of pageRows) {
        const dimensions = row.dimensionValues || [];
        const metrics = row.metricValues || [];
        const metricDate = parseGaDate(dimensions[0]?.value || '');
        if (!metricDate) {
          throw new GoogleAnalyticsApiError('Google Analytics Data API trả về ngày không hợp lệ.');
        }

        rows.push({
          metricDate,
          pagePath: normalizePagePath(dimensions[1]?.value || '/'),
          pageViews: parseMetricValue(metrics[0]?.value, 'screenPageViews'),
          userEngagementDurationSeconds: parseMetricValue(
            metrics[1]?.value,
            'userEngagementDuration',
          ),
        });
      }

      if (pageRows.length < DEFAULT_PAGE_SIZE) break;
      offset += pageRows.length;
    }

    return rows;
  }

  async checkConnection() {
    const accessToken = await this.getAccessToken();
    const response = await this.fetchImpl(
      `${DATA_API_URL}/properties/${this.propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
          metrics: [{ name: 'sessions' }],
          limit: 1,
        }),
      },
    );

    if (!response.ok) {
      throw new GoogleAnalyticsApiError(
        `Google Analytics Data API trả về HTTP ${response.status}. Kiểm tra quyền analytics.readonly và GA4 Property ID.`,
      );
    }

    await parseJson(response, 'Google Analytics Data API');
  }

  async getAccessToken() {
    let response;
    try {
      response = await this.fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
    } catch {
      throw new GoogleAnalyticsApiError('Không kết nối được dịch vụ OAuth của Google.');
    }

    if (!response.ok) {
      throw new GoogleAnalyticsApiError(
        `Google OAuth trả về HTTP ${response.status}. Kiểm tra cấu hình OAuth GA4.`,
      );
    }

    const tokenResponse = await parseJson(response, 'Google OAuth');
    if (typeof tokenResponse.access_token !== 'string' || tokenResponse.access_token.length === 0) {
      throw new GoogleAnalyticsApiError('Google OAuth không trả về access token hợp lệ.');
    }

    return tokenResponse.access_token;
  }
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseGaDate(value) {
  if (!/^\d{8}$/.test(value)) return null;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return isValidDate(date) ? date : null;
}

function normalizePagePath(value) {
  if (!value || value === '(not set)') return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function parseMetricValue(value, metricName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new GoogleAnalyticsApiError(
      `Google Analytics Data API trả về chỉ số ${metricName} không hợp lệ.`,
    );
  }
  return parsed;
}

async function parseJson(response, serviceName) {
  try {
    return await response.json();
  } catch {
    throw new GoogleAnalyticsApiError(`${serviceName} trả về phản hồi không hợp lệ.`);
  }
}

module.exports = {
  GoogleAnalyticsApiError,
  GoogleAnalyticsConfigurationError,
  GoogleAnalyticsDataApiAdapter,
  getGoogleAnalyticsConnectionStatus,
  getGoogleAnalyticsConfigurationStatus,
};
