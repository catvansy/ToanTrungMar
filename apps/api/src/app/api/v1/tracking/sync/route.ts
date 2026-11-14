import { prisma } from '@toantrung/database';
import {
  GetSyncLogsQuerySchema,
  SYNC_RUN_TYPES,
  SYNC_STATUSES,
  TriggerSyncRequestSchema,
} from '@toantrung/contracts/02-tracking-sync';
import type {
  GoogleAdsConnectionInfoDto,
  PublicGoogleAdsConnectionInfoDto,
  PublicPlatformSyncLogDto,
  PublicSyncExecutionResultDto,
  SyncExecutionResultDto,
} from '@toantrung/contracts/02-tracking-sync';
import { jsonError, jsonSuccess } from '@api/core/http';
import { requirePermissionSession } from '@api/core/permissions';
import {
  GoogleAnalyticsSyncService,
  getGoogleAnalyticsConnectionStatus,
  getGoogleAnalyticsConfigurationStatus,
} from '@api/modules/02-tracking-sync';
import { runTrackingSyncWorker } from '@api/modules/02-tracking-sync/workers/tracking-sync.worker';
import { checkGoogleAdsConnectionStatus } from '@api/modules/02-tracking-sync/providers/google-ads';

function redactGoogleAdsAccountIds(value: string | null): string | null {
  if (value === null) return null;
  const configuredIds = [
    process.env.GOOGLE_ADS_CUSTOMER_ID,
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  ].filter((id): id is string => Boolean(id));

  return configuredIds.reduce((message, id) => {
    const digits = id.replace(/\D/g, '');
    const variants = [id, digits];
    if (digits.length === 10) {
      variants.push(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
    }
    return variants.reduce((current, variant) => current.split(variant).join('[ẩn]'), message);
  }, value);
}

function toPublicConnectionInfo(
  connection: GoogleAdsConnectionInfoDto,
): PublicGoogleAdsConnectionInfoDto {
  const {
    targetCustomerId,
    loginCustomerId,
    accountPropertyId,
    accessibleCustomers,
    ...publicConnection
  } = connection;
  void targetCustomerId;
  void loginCustomerId;
  void accountPropertyId;
  void accessibleCustomers;
  return {
    ...publicConnection,
    message: redactGoogleAdsAccountIds(connection.message) || '',
  };
}

function toPublicSyncResult(result: SyncExecutionResultDto): PublicSyncExecutionResultDto {
  const { accountPropertyId, errorMessage, ...publicResult } = result;
  void accountPropertyId;
  return {
    ...publicResult,
    errorMessage: redactGoogleAdsAccountIds(errorMessage),
  };
}

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'TRACKING_ADS_OPTIMIZE', { requireCsrf: false });
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsedQuery = GetSyncLogsQuerySchema.safeParse(params);

    if (!parsedQuery.success) {
      return jsonError('INVALID_QUERY', 'Tham số truy vấn logs không hợp lệ.', 400, parsedQuery.error.format());
    }

    const where: Record<string, unknown> = {};
    if (parsedQuery.data.platform) {
      where.platform = parsedQuery.data.platform;
    }

    const [logs, connectionInfo] = await Promise.all([
      prisma.platformSyncLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: parsedQuery.data.limit,
        skip: parsedQuery.data.offset,
      }),
      parsedQuery.data.platform === 'ga4'
        ? Promise.resolve(undefined)
        : checkGoogleAdsConnectionStatus().catch(() => undefined),
    ]);
    const googleAnalytics =
      parsedQuery.data.platform === 'ga4'
        ? await getGoogleAnalyticsConnectionStatus()
        : getGoogleAnalyticsConfigurationStatus();

    // Tự động đồng bộ các chiến dịch mới phát hiện từ Google Ads API vào database
    if (connectionInfo?.isConnected && connectionInfo.liveCampaigns && connectionInfo.liveCampaigns.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      for (const camp of connectionInfo.liveCampaigns) {
        try {
          const budgetMicros = BigInt(camp.dailyBudgetMicros || '0');
          const costMicros = BigInt(camp.costMicros || '0');
          const dbCamp = await prisma.campaign.upsert({
            where: {
              uq_campaign_platform_account_code: {
                platform: 'google_ads',
                accountExternalId: connectionInfo.accountPropertyId,
                campaignCode: camp.id,
              },
            },
            update: {
              campaignName: camp.name,
              dailyBudgetMicros: budgetMicros,
              isActive: camp.status === 'ENABLED',
            },
            create: {
              platform: 'google_ads',
              accountExternalId: connectionInfo.accountPropertyId,
              campaignCode: camp.id,
              campaignName: camp.name,
              currencyCode: camp.currencyCode || 'VND',
              dailyBudgetMicros: budgetMicros,
              isActive: camp.status === 'ENABLED',
            },
          });

          const fingerprint = `google_ads|${connectionInfo.accountPropertyId}|campaign|${camp.id}|${today}`;
          await prisma.platformDailyMetric.upsert({
            where: {
              uq_platform_metric_scope: {
                platform: 'google_ads',
                accountPropertyId: connectionInfo.accountPropertyId,
                metricDate: today,
                grain: 'campaign',
                campaignExternalId: camp.id,
                keywordMatchType: '',
                keywordTextNorm: '',
                pagePathNorm: '',
              },
            },
            update: {
              spendMicros: costMicros,
              dailyBudgetMicros: budgetMicros,
              impressions: camp.impressions,
              clicks: camp.clicks,
              conversionsMicros: BigInt(Math.round(camp.conversions * 1_000_000)),
              isFinalized: true,
              syncedAt: new Date(),
              campaign: { connect: { id: dbCamp.id } },
            },
            create: {
              platform: 'google_ads',
              accountPropertyId: connectionInfo.accountPropertyId,
              metricDate: today,
              grain: 'campaign',
              campaignExternalId: camp.id,
              campaignName: camp.name,
              keywordMatchType: '',
              keywordTextNorm: '',
              pagePathNorm: '',
              currencyCode: camp.currencyCode || 'VND',
              spendMicros: costMicros,
              dailyBudgetMicros: budgetMicros,
              impressions: camp.impressions,
              clicks: camp.clicks,
              conversionsMicros: BigInt(Math.round(camp.conversions * 1_000_000)),
              dimensionFingerprint: fingerprint,
              isFinalized: true,
              syncedAt: new Date(),
              campaign: { connect: { id: dbCamp.id } },
            },
          });
        } catch {
          // Bỏ qua lỗi lẻ khi upsert để không làm gián đoạn API
        }
      }
    }

    const formatted: PublicPlatformSyncLogDto[] = logs.map((l) => {
      const runType = SYNC_RUN_TYPES.find((candidate) => candidate === l.runType);
      if (!runType) throw new Error(`Không xác định loại đồng bộ trong log #${l.id}.`);
      const status = SYNC_STATUSES.find((candidate) => candidate === l.status);
      if (!status) throw new Error(`Không xác định trạng thái đồng bộ trong log #${l.id}.`);
      return {
        id: l.id,
        platform: l.platform,
        runType,
        windowStartDate: l.windowStartDate,
        windowEndDate: l.windowEndDate,
        recordsSynced: l.recordsSynced,
        status,
        errorMessage: redactGoogleAdsAccountIds(l.errorMessage),
        consecutiveFailures: l.consecutiveFailures,
        startedAt: l.startedAt.toISOString(),
        completedAt: l.completedAt ? l.completedAt.toISOString() : null,
        durationMs: l.completedAt ? l.completedAt.getTime() - l.startedAt.getTime() : null,
      };
    });

    return jsonSuccess({
      logs: formatted,
      count: formatted.length,
      connection: connectionInfo ? toPublicConnectionInfo(connectionInfo) : undefined,
      googleAnalytics,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError('SYNC_LOGS_QUERY_FAILED', `Lỗi truy vấn lịch sử đồng bộ: ${msg}`, 500);
  }
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'TRACKING_ADS_OPTIMIZE');
  if (!auth.ok) return auth.response;

  try {
    const rawBody = await req.json().catch(() => ({}));
    const parsedBody = TriggerSyncRequestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return jsonError('INVALID_SYNC_REQUEST', 'Yêu cầu đồng bộ không hợp lệ.', 400, parsedBody.error.format());
    }

    const { platform, runType, startDate, endDate, forceMock } = parsedBody.data;
    if (platform !== 'google_ads' && platform !== 'ga4') {
      return jsonError(
        'PLATFORM_SYNC_NOT_SUPPORTED',
        `Chưa hỗ trợ đồng bộ nền tảng ${platform}.`,
        400,
      );
    }

    if (platform === 'ga4' && forceMock) {
      return jsonError('GA4_MOCK_NOT_SUPPORTED', 'GA4 không hỗ trợ dữ liệu giả lập.', 400);
    }
    if (platform === 'ga4' && Boolean(startDate) !== Boolean(endDate)) {
      return jsonError(
        'INVALID_SYNC_WINDOW',
        'Cần cung cấp đủ ngày bắt đầu và ngày kết thúc khi đồng bộ GA4.',
        400,
      );
    }
    if (platform === 'ga4' && startDate && endDate && startDate > endDate) {
      return jsonError('INVALID_SYNC_WINDOW', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.', 400);
    }

    const result =
      platform === 'google_ads'
        ? await runTrackingSyncWorker(prisma, runType, {
            startDate,
            endDate,
            forceMock: forceMock ?? false,
          })
        : await new GoogleAnalyticsSyncService(prisma).executeSync({
            runType,
            startDate,
            endDate,
          });

    if (result.status === 'failed') {
      const publicResult = toPublicSyncResult(result);
      return jsonError(
        platform === 'google_ads' ? 'GOOGLE_ADS_SYNC_FAILED' : 'GA4_SYNC_FAILED',
        publicResult.errorMessage ||
          `Tiến trình đồng bộ ${platform === 'ga4' ? 'GA4' : 'Google Ads'} thất bại.`,
        502,
        publicResult,
      );
    }

    return jsonSuccess(toPublicSyncResult(result), 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError('SYNC_EXECUTION_FAILED', `Lỗi thực thi đồng bộ: ${msg}`, 500);
  }
}
