'use strict';

const {
  GoogleAdsError,
  GoogleAdsAuthError,
  GoogleAdsRateLimitError,
  GoogleAdsTimeoutError,
} = require('../../index.js');

function readFirstConfiguredValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

class GoogleAdsApiAdapter {
  constructor(config = {}) {
    this.config = {
      customerId: (config.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '').trim(),
      loginCustomerId: (config.loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '')
        .replace(/-/g, '')
        .trim(),
      clientId: readFirstConfiguredValue(
        config.clientId,
        process.env.GOOGLE_ADS_CLIENT_ID,
        process.env.GOOGLE_CLOUD_CLIENT_ID,
      ),
      clientSecret: readFirstConfiguredValue(
        config.clientSecret,
        process.env.GOOGLE_ADS_CLIENT_SECRET,
        process.env.GOOGLE_CLOUD_CLIENT_SECRET,
      ),
      refreshToken: readFirstConfiguredValue(
        config.refreshToken,
        process.env.GOOGLE_ADS_REFRESH_TOKEN,
        process.env.GOOGLE_CLOUD_REFRESH_TOKEN,
      ),
      apiVersion: config.apiVersion || process.env.GOOGLE_ADS_API_VERSION || 'v26',
    };
    this.accountPropertyId = `gads:${this.config.customerId}`;
    this.isMock = false;
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
  }

  validateConfig() {
    if (!/^\d{10}$/.test(this.config.customerId)) {
      throw new GoogleAdsAuthError('GOOGLE_ADS_CUSTOMER_ID phải là mã tài khoản Google Ads gồm đúng 10 chữ số.');
    }
    if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken) {
      throw new GoogleAdsAuthError(
        'Thiếu thông tin Google Ads OAuth Credential (Client ID, Client Secret hoặc Refresh Token).',
      );
    }
  }

  async getValidAccessToken() {
    this.validateConfig();
    if (this.cachedAccessToken && this.tokenExpiresAt > Date.now() + 60_000) {
      return this.cachedAccessToken;
    }

    let response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
    } catch (error) {
      throw new GoogleAdsAuthError(`Không kết nối được OAuth Google: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!response.ok) {
      throw new GoogleAdsAuthError(`Không thể làm mới Google Access Token (HTTP ${response.status}).`);
    }

    const token = await response.json();
    if (!token.access_token) {
      throw new GoogleAdsAuthError('Google OAuth không trả về access token hợp lệ.');
    }

    this.cachedAccessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + Number(token.expires_in || 3600) * 1000;
    return this.cachedAccessToken;
  }

  async executeGaqlStream(query) {
    const accessToken = await this.getValidAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    if (this.config.loginCustomerId) {
      headers['login-customer-id'] = this.config.loginCustomerId;
    }

    try {
      const response = await fetch(
        `https://googleads.googleapis.com/${this.config.apiVersion}/customers/${this.config.customerId}/googleAds:searchStream`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ query }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        const message = detail.slice(0, 300);
        if (response.status === 401 || response.status === 403) {
          throw new GoogleAdsAuthError(`Google Ads API từ chối truy cập (HTTP ${response.status}): ${message}`);
        }
        if (response.status === 429) {
          throw new GoogleAdsRateLimitError(`Google Ads API vượt hạn mức: ${message}`);
        }
        throw new GoogleAdsError(
          `Google Ads API trả về lỗi HTTP ${response.status}: ${message}`,
          'GOOGLE_ADS_API_ERROR',
          response.status,
          response.status >= 500,
        );
      }

      const chunks = await response.json();
      return chunks.flatMap((chunk) => (Array.isArray(chunk.results) ? chunk.results : []));
    } catch (error) {
      if (error instanceof GoogleAdsError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GoogleAdsTimeoutError('Google Ads API quá thời gian chờ (30000ms).');
      }
      throw new GoogleAdsError(
        `Lỗi gọi Google Ads API: ${error instanceof Error ? error.message : String(error)}`,
        'GOOGLE_ADS_CALL_FAILED',
        undefined,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchCampaignMetrics(window) {
    const query = `
      SELECT campaign.id, campaign.name, campaign.status, segments.date,
        metrics.cost_micros, campaign_budget.amount_micros, metrics.average_cpc,
        metrics.impressions, metrics.clicks, metrics.conversions, customer.currency_code
      FROM campaign
      WHERE segments.date BETWEEN '${window.startDate}' AND '${window.endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `.trim();
    const rows = await this.executeGaqlStream(query);
    return rows.map((row) => ({
      campaignId: String(row.campaign?.id || ''),
      campaignName: String(row.campaign?.name || ''),
      campaignStatus: row.campaign?.status || 'ENABLED',
      date: String(row.segments?.date || ''),
      costMicros: String(row.metrics?.costMicros || '0'),
      dailyBudgetMicros: row.campaignBudget?.amountMicros ? String(row.campaignBudget.amountMicros) : null,
      averageCpcMicros: row.metrics?.averageCpc ? String(Math.round(Number(row.metrics.averageCpc))) : null,
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      conversions: Number(row.metrics?.conversions || 0),
      currencyCode: String(row.customer?.currencyCode || 'VND'),
    }));
  }

  async fetchKeywordMetrics(window) {
    const query = `
      SELECT campaign.id, campaign.name, ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        segments.date, metrics.cost_micros, metrics.average_cpc, metrics.impressions,
        metrics.clicks, metrics.conversions, customer.currency_code
      FROM keyword_view
      WHERE segments.date BETWEEN '${window.startDate}' AND '${window.endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `.trim();
    const rows = await this.executeGaqlStream(query);
    return rows.map((row) => ({
      campaignId: String(row.campaign?.id || ''),
      campaignName: String(row.campaign?.name || ''),
      criterionId: String(row.adGroupCriterion?.criterionId || ''),
      keywordText: String(row.adGroupCriterion?.keyword?.text || ''),
      matchType: row.adGroupCriterion?.keyword?.matchType || 'PHRASE',
      date: String(row.segments?.date || ''),
      costMicros: String(row.metrics?.costMicros || '0'),
      averageCpcMicros: row.metrics?.averageCpc
        ? String(Math.round(Number(row.metrics.averageCpc)))
        : null,
      impressions: Number(row.metrics?.impressions || 0),
      clicks: Number(row.metrics?.clicks || 0),
      conversions: Number(row.metrics?.conversions || 0),
      currencyCode: String(row.customer?.currencyCode || 'VND'),
    }));
  }

  async fetchLiveCampaignList() {
    const query = `
      SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros,
        metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,
        customer.currency_code
      FROM campaign
      WHERE campaign.status != 'REMOVED'
      ORDER BY campaign.name ASC
    `.trim();
    const rows = await this.executeGaqlStream(query);
    return rows.map((row) => {
      const dailyBudgetMicros = String(row.campaignBudget?.amountMicros || '0');
      const costMicros = String(row.metrics?.costMicros || '0');
      return {
        id: String(row.campaign?.id || ''),
        name: String(row.campaign?.name || `Chiến dịch ${row.campaign?.id}`),
        status: String(row.campaign?.status || 'ENABLED'),
        dailyBudgetMicros,
        dailyBudgetVnd: Math.round(Number(BigInt(dailyBudgetMicros) / 1_000_000n)),
        costMicros,
        costVnd: Math.round(Number(BigInt(costMicros) / 1_000_000n)),
        clicks: Number(row.metrics?.clicks || 0),
        impressions: Number(row.metrics?.impressions || 0),
        conversions: Number(row.metrics?.conversions || 0),
        currencyCode: String(row.customer?.currencyCode || 'VND'),
      };
    });
  }

  async getHealthStatus() {
    try {
      await this.getValidAccessToken();
      await this.executeGaqlStream('SELECT customer.id FROM customer LIMIT 1');
      return {
        ok: true,
        provider: 'live',
        accountPropertyId: this.accountPropertyId,
        accessLevel: 'Live Verified',
        message: 'Kết nối Google Ads API thành công.',
      };
    } catch (error) {
      return {
        ok: false,
        provider: 'live',
        accountPropertyId: this.accountPropertyId,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

module.exports = { GoogleAdsApiAdapter };
