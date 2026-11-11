import type { IGoogleAdsClient, GoogleAdsHealthCheckResult } from './google-ads-client.interface';
import {
  type GoogleAdsCampaignMetricRow,
  type GoogleAdsKeywordMetricRow,
  type GoogleAdsSyncWindow,
  type GoogleAdsSyncOptions,
  GoogleAdsError,
  GoogleAdsAuthError,
  GoogleAdsRateLimitError,
  GoogleAdsTimeoutError,
} from './google-ads.types';

export interface GoogleAdsApiConfig {
  customerId: string; // 10 digits
  loginCustomerId?: string; // MCC ID
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  apiVersion?: string; // default: 'v18'
}

export class GoogleAdsApiAdapter implements IGoogleAdsClient {
  public readonly accountPropertyId: string;
  public readonly isMock = false;
  private readonly config: GoogleAdsApiConfig;
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: GoogleAdsApiConfig) {
    this.config = {
      ...config,
      customerId: config.customerId.replace(/-/g, '').trim(),
      loginCustomerId: config.loginCustomerId ? config.loginCustomerId.replace(/-/g, '').trim() : undefined,
      apiVersion: config.apiVersion || 'v18',
    };
    this.accountPropertyId = `gads:${this.config.customerId}`;
  }

  public async getHealthStatus(): Promise<GoogleAdsHealthCheckResult> {
    try {
      const token = await this.getValidAccessToken();
      return {
        ok: !!token,
        provider: 'live',
        accountPropertyId: this.accountPropertyId,
        accessLevel: 'Explorer/Standard Access Verified',
        message: 'Google Ads API đã xác thực thành công qua OAuth Token.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        provider: 'live',
        accountPropertyId: this.accountPropertyId,
        message: `Kết nối Google Ads API thất bại: ${msg}`,
      };
    }
  }

  private async getValidAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60_000) {
      return this.cachedAccessToken;
    }

    if (!this.config.clientId || !this.config.clientSecret || !this.config.refreshToken) {
      throw new GoogleAdsAuthError(
        'Thiếu thông tin Google Ads OAuth Credential (Client ID, Client Secret hoặc Refresh Token).',
      );
    }

    try {
      const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new GoogleAdsAuthError(`Không thể làm mới Google Access Token (HTTP ${resp.status}): ${errText}`);
      }

      const data = (await resp.json()) as { access_token: string; expires_in: number };
      this.cachedAccessToken = data.access_token;
      this.tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
      return this.cachedAccessToken;
    } catch (err: unknown) {
      if (err instanceof GoogleAdsError) throw err;
      throw new GoogleAdsAuthError(`Lỗi kết nối OAuth Google: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async executeGaqlStream(query: string, timeoutMs = 30000): Promise<any[]> {
    const accessToken = await this.getValidAccessToken();
    const url = `https://googleads.googleapis.com/${this.config.apiVersion}/customers/${this.config.customerId}/googleAds:searchStream`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    if (this.config.loginCustomerId) {
      headers['login-customer-id'] = this.config.loginCustomerId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        if (resp.status === 401 || resp.status === 403) {
          throw new GoogleAdsAuthError(`Google Ads API từ chối truy cập (HTTP ${resp.status}): ${errorText}`);
        }
        if (resp.status === 429) {
          throw new GoogleAdsRateLimitError(`Google Ads API báo vượt hạn mức Quota/Rate Limit: ${errorText}`);
        }
        throw new GoogleAdsError(
          `Google Ads API trả về lỗi HTTP ${resp.status}: ${errorText}`,
          'GOOGLE_ADS_HTTP_ERROR',
          resp.status,
          resp.status >= 500,
        );
      }

      const streamChunks = (await resp.json()) as Array<{ results?: any[] }>;
      const allRows: any[] = [];
      for (const chunk of streamChunks) {
        if (Array.isArray(chunk.results)) {
          allRows.push(...chunk.results);
        }
      }
      return allRows;
    } catch (err: unknown) {
      if (err instanceof GoogleAdsError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new GoogleAdsTimeoutError(`Google Ads API quá thời gian chờ (${timeoutMs}ms).`);
      }
      throw new GoogleAdsError(
        `Lỗi gọi Google Ads API: ${err instanceof Error ? err.message : String(err)}`,
        'GOOGLE_ADS_CALL_FAILED',
        undefined,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  public async fetchCampaignMetrics(
    window: GoogleAdsSyncWindow,
    _options?: GoogleAdsSyncOptions,
  ): Promise<GoogleAdsCampaignMetricRow[]> {
    const gaql = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        segments.date,
        metrics.cost_micros,
        campaign_budget.amount_micros,
        metrics.average_cpc,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        customer.currency_code
      FROM campaign
      WHERE segments.date BETWEEN '${window.startDate}' AND '${window.endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `.trim();

    const rawRows = await this.executeGaqlStream(gaql);
    return rawRows.map((r) => {
      const c = r.campaign || {};
      const seg = r.segments || {};
      const m = r.metrics || {};
      const b = r.campaignBudget || {};
      const cust = r.customer || {};

      return {
        campaignId: String(c.id || ''),
        campaignName: String(c.name || ''),
        campaignStatus: (c.status as 'ENABLED' | 'PAUSED' | 'REMOVED') || 'ENABLED',
        date: String(seg.date || ''),
        costMicros: String(m.costMicros || '0'),
        dailyBudgetMicros: b.amountMicros ? String(b.amountMicros) : null,
        averageCpcMicros: m.averageCpc ? String(Math.round(Number(m.averageCpc))) : null,
        impressions: Number(m.impressions || 0),
        clicks: Number(m.clicks || 0),
        conversions: Number(m.conversions || 0),
        currencyCode: String(cust.currencyCode || 'VND'),
      };
    });
  }

  public async fetchKeywordMetrics(
    window: GoogleAdsSyncWindow,
    _options?: GoogleAdsSyncOptions,
  ): Promise<GoogleAdsKeywordMetricRow[]> {
    const gaql = `
      SELECT
        campaign.id,
        campaign.name,
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        segments.date,
        metrics.cost_micros,
        metrics.average_cpc,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        customer.currency_code
      FROM keyword_view
      WHERE segments.date BETWEEN '${window.startDate}' AND '${window.endDate}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `.trim();

    const rawRows = await this.executeGaqlStream(gaql);
    return rawRows.map((r) => {
      const c = r.campaign || {};
      const crit = r.adGroupCriterion || {};
      const kw = crit.keyword || {};
      const seg = r.segments || {};
      const m = r.metrics || {};
      const cust = r.customer || {};

      return {
        campaignId: String(c.id || ''),
        campaignName: String(c.name || ''),
        criterionId: String(crit.criterionId || ''),
        keywordText: String(kw.text || ''),
        matchType: (kw.matchType as 'EXACT' | 'PHRASE' | 'BROAD') || 'PHRASE',
        date: String(seg.date || ''),
        costMicros: String(m.costMicros || '0'),
        averageCpcMicros: m.averageCpc ? String(Math.round(Number(m.averageCpc))) : null,
        impressions: Number(m.impressions || 0),
        clicks: Number(m.clicks || 0),
        conversions: Number(m.conversions || 0),
        currencyCode: String(cust.currencyCode || 'VND'),
      };
    });
  }
}
