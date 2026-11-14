'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GoogleAnalyticsApiError,
  GoogleAnalyticsConfigurationError,
  GoogleAnalyticsDataApiAdapter,
  getGoogleAnalyticsConnectionStatus,
  getGoogleAnalyticsConfigurationStatus,
} = require('../providers/google-analytics/google-analytics-data.adapter');
const {
  calculateSyncWindow,
  GoogleAnalyticsSyncService,
} = require('../services/google-analytics-sync.service');
const trackingModule = require('../index.js');

const validConfig = {
  propertyId: '564242708',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh-token',
};

const validEnvironment = {
  GOOGLE_ANALYTICS_API_ID: validConfig.propertyId,
  GOOGLE_ANALYTICS_CLIENT_ID: validConfig.clientId,
  GOOGLE_ANALYTICS_CLIENT_SECRET: validConfig.clientSecret,
  GOOGLE_ANALYTICS_REFRESH_TOKEN: validConfig.refreshToken,
};

const googleCloudEnvironment = {
  GOOGLE_ANALYTICS_API_ID: validConfig.propertyId,
  GOOGLE_CLOUD_CLIENT_ID: validConfig.clientId,
  GOOGLE_CLOUD_CLIENT_SECRET: validConfig.clientSecret,
  GOOGLE_CLOUD_REFRESH_TOKEN: validConfig.refreshToken,
};

const googleAdsEnvironment = {
  GOOGLE_ANALYTICS_API_ID: validConfig.propertyId,
  GOOGLE_ADS_CLIENT_ID: validConfig.clientId,
  GOOGLE_ADS_CLIENT_SECRET: validConfig.clientSecret,
  GOOGLE_CLOUD_REFRESH_TOKEN: validConfig.refreshToken,
};

test('GA4 adapter exchanges OAuth credentials and maps page report rows', async () => {
  const requests = [];
  const adapter = new GoogleAnalyticsDataApiAdapter(validConfig, async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'access-token' });
    }
    return Response.json({
      rows: [
        {
          dimensionValues: [{ value: '20261112' }, { value: 'services' }],
          metricValues: [{ value: '25' }, { value: '75.5' }],
        },
      ],
    });
  });

  const rows = await adapter.fetchPageMetrics({
    startDate: '2026-11-10',
    endDate: '2026-11-12',
  });

  assert.deepEqual(rows, [
    {
      metricDate: '2026-11-12',
      pagePath: '/services',
      pageViews: 25,
      userEngagementDurationSeconds: 75.5,
    },
  ]);
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /properties\/564242708:runReport$/);
  assert.equal(requests[1].options.headers.authorization, 'Bearer access-token');
  assert.deepEqual(JSON.parse(requests[1].options.body).dimensions, [
    { name: 'date' },
    { name: 'pagePath' },
  ]);
});

test('M02 CommonJS entry exports GA4 API, status, and sync service', () => {
  assert.equal(trackingModule.GoogleAnalyticsDataApiAdapter, GoogleAnalyticsDataApiAdapter);
  assert.equal(trackingModule.getGoogleAnalyticsConnectionStatus, getGoogleAnalyticsConnectionStatus);
  assert.equal(typeof trackingModule.getGoogleAnalyticsConfigurationStatus, 'function');
  assert.equal(trackingModule.GoogleAnalyticsSyncService, GoogleAnalyticsSyncService);
});

test('GA4 connection status performs a read-only live property check', async () => {
  const requests = [];
  const status = await getGoogleAnalyticsConnectionStatus(validEnvironment, async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'access-token' });
    }
    return Response.json({ rowCount: 0 });
  });

  assert.equal(status.isConfigured, true);
  assert.equal(status.isConnected, true);
  assert.equal(status.status, 'CONNECTED');
  assert.equal(status.statusLabel, 'Đã kết nối trực tiếp (Live)');
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /properties\/564242708:runReport$/);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
    metrics: [{ name: 'sessions' }],
    limit: 1,
  });
});

test('GA4 connection status accepts the existing Google Cloud OAuth environment names', async () => {
  const requests = [];
  const status = await getGoogleAnalyticsConnectionStatus(
    googleCloudEnvironment,
    async (url, options) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('oauth2.googleapis.com')) {
        return Response.json({ access_token: 'access-token' });
      }
      return Response.json({ rowCount: 0 });
    },
  );

  assert.equal(status.isConfigured, true);
  assert.equal(status.isConnected, true);
  const tokenRequest = new URLSearchParams(requests[0].options.body);
  assert.equal(tokenRequest.get('client_id'), validConfig.clientId);
  assert.equal(tokenRequest.get('client_secret'), validConfig.clientSecret);
  assert.equal(tokenRequest.get('refresh_token'), validConfig.refreshToken);
});

test('GA4 accepts shared Google Ads client credentials with the cloud refresh token', async () => {
  const status = await getGoogleAnalyticsConnectionStatus(
    googleAdsEnvironment,
    async (url) =>
      String(url).includes('oauth2.googleapis.com')
        ? Response.json({ access_token: 'access-token' })
        : Response.json({ rowCount: 0 }),
  );

  assert.equal(status.isConfigured, true);
  assert.equal(status.isConnected, true);
});

test('GA4 connection status distinguishes missing config from live API errors', async () => {
  let fetchCount = 0;
  const missing = await getGoogleAnalyticsConnectionStatus(
    { GOOGLE_ANALYTICS_API_ID: validConfig.propertyId },
    async () => {
      fetchCount += 1;
      return Response.json({});
    },
  );
  assert.equal(missing.isConnected, false);
  assert.equal(missing.status, 'CONFIG_MISSING');
  assert.equal(fetchCount, 0);
  assert.match(missing.message, /GOOGLE_CLOUD_REFRESH_TOKEN/);

  const apiError = await getGoogleAnalyticsConnectionStatus(validEnvironment, async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'access-token' });
    }
    return { ok: false, status: 403, json: async () => ({ error: 'client-secret' }) };
  });
  assert.equal(apiError.isConfigured, true);
  assert.equal(apiError.isConnected, false);
  assert.equal(apiError.status, 'API_ERROR');
  assert.match(apiError.message, /HTTP 403/);
  assert.doesNotMatch(apiError.message, /client-secret|refresh-token/);
});

test('GA4 adapter rejects invalid configuration and dates before making requests', async () => {
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return Response.json({});
  };

  assert.throws(
    () => new GoogleAnalyticsDataApiAdapter({ ...validConfig, propertyId: 'GA4-PLACEHOLDER' }, fetchImpl),
    GoogleAnalyticsConfigurationError,
  );
  const adapter = new GoogleAnalyticsDataApiAdapter(validConfig, fetchImpl);
  await assert.rejects(
    () => adapter.fetchPageMetrics({ startDate: '2026-02-30', endDate: '2026-03-01' }),
    GoogleAnalyticsConfigurationError,
  );
  assert.equal(fetchCount, 0);
});

test('GA4 adapter surfaces OAuth failures without exposing credentials', async () => {
  const adapter = new GoogleAnalyticsDataApiAdapter(validConfig, async () => ({
    ok: false,
    status: 401,
  }));
  await assert.rejects(
    () => adapter.fetchPageMetrics({ startDate: '2026-11-10', endDate: '2026-11-12' }),
    (error) => {
      assert.ok(error instanceof GoogleAnalyticsApiError);
      assert.match(error.message, /HTTP 401/);
      assert.doesNotMatch(error.message, /client-secret|refresh-token/);
      return true;
    },
  );
});

test('GA4 adapter surfaces Data API failures without exposing credentials', async () => {
  const adapter = new GoogleAnalyticsDataApiAdapter(validConfig, async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'access-token' });
    }
    return {
      ok: false,
      status: 403,
      json: async () => ({ error: 'refresh-token client-secret' }),
    };
  });
  await assert.rejects(
    () => adapter.fetchPageMetrics({ startDate: '2026-11-10', endDate: '2026-11-12' }),
    (error) => {
      assert.match(error.message, /HTTP 403/);
      assert.doesNotMatch(error.message, /refresh-token|client-secret/);
      return true;
    },
  );
});

test('GA4 full sync window covers seven calendar days', () => {
  const window = calculateSyncWindow('full');
  const start = Date.parse(`${window.startDate}T00:00:00Z`);
  const end = Date.parse(`${window.endDate}T00:00:00Z`);
  assert.equal((end - start) / (24 * 60 * 60 * 1000), 6);
});

test('GA4 sync idempotently upserts page metrics and records a successful sync log', async () => {
  const logUpdates = [];
  const upserts = [];
  const prisma = {
    platformSyncLog: {
      findFirst: async () => null,
      create: async ({ data }) => ({ id: 8, ...data }),
      update: async ({ data }) => logUpdates.push(data),
    },
    platformDailyMetric: {
      upsert: async (args) => upserts.push(args),
    },
  };
  const service = new GoogleAnalyticsSyncService(prisma, {
    clientOverride: {
      accountPropertyId: validConfig.propertyId,
      fetchPageMetrics: async () => [
        {
          metricDate: '2000-01-01',
          pagePath: '/services',
          pageViews: 25,
          userEngagementDurationSeconds: 75,
        },
      ],
    },
  });

  const params = { runType: 'full', startDate: '2000-01-01', endDate: '2000-01-01' };
  const result = await service.executeSync(params);
  const repeatedResult = await service.executeSync(params);

  assert.equal(result.status, 'success');
  assert.equal(result.recordsSynced, 1);
  assert.equal(repeatedResult.status, 'success');
  assert.equal(upserts.length, 2);
  assert.equal(upserts[0].create.platform, 'ga4');
  assert.equal(upserts[0].create.grain, 'page');
  assert.equal(upserts[0].create.pagePathNorm, '/services');
  assert.equal(upserts[0].create.pageViews, 25);
  assert.equal(upserts[0].create.avgTimeOnPageSec, 3);
  assert.deepEqual(upserts[0].where, upserts[1].where);
  assert.equal(logUpdates[0].status, 'success');
  assert.equal(logUpdates[0].recordsSynced, 1);
  assert.equal(logUpdates[1].status, 'success');
});

test('GA4 sync records provider failures in the sync log', async () => {
  const logUpdates = [];
  const prisma = {
    platformSyncLog: {
      findFirst: async () => ({ status: 'failed', consecutiveFailures: 2 }),
      create: async ({ data }) => ({ id: 9, ...data }),
      update: async ({ data }) => logUpdates.push(data),
    },
  };
  const service = new GoogleAnalyticsSyncService(prisma, {
    clientOverride: {
      accountPropertyId: validConfig.propertyId,
      fetchPageMetrics: async () => {
        throw new GoogleAnalyticsApiError('Google Analytics Data API trả về HTTP 403.');
      },
    },
  });

  const result = await service.executeSync({
    startDate: '2000-01-01',
    endDate: '2000-01-01',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.recordsSynced, 0);
  assert.equal(logUpdates[0].status, 'failed');
  assert.equal(logUpdates[0].consecutiveFailures, 3);
  assert.match(logUpdates[0].errorMessage, /HTTP 403/);
});

test('GA4 configuration status reports missing OAuth settings', () => {
  const status = getGoogleAnalyticsConfigurationStatus({
    GOOGLE_ANALYTICS_API_ID: validConfig.propertyId,
  });
  assert.equal(status.isConfigured, false);
  assert.equal(status.status, 'CONFIG_MISSING');
  assert.match(status.message, /GOOGLE_CLOUD_REFRESH_TOKEN/);
});
