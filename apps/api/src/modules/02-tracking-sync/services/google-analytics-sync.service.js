'use strict';

const {
  upsertPlatformMetricIdempotent,
} = require('../../../../../../packages/database/src/operations-runtime.js');
const {
  GoogleAnalyticsDataApiAdapter,
} = require('../providers/google-analytics/google-analytics-data.adapter');

class GoogleAnalyticsSyncService {
  /**
   * @param {import('@toantrung/database').PrismaClient} prisma
   * @param {{ clientOverride?: GoogleAnalyticsClient }} [options]
   */
  constructor(prisma, options = {}) {
    this.prisma = prisma;
    this.clientOverride = options.clientOverride;
  }

  /**
   * @param {{ runType?: 'full' | 'light' | 'replay'; startDate?: string; endDate?: string }} [params]
   * @returns {Promise<import('@toantrung/contracts/02-tracking-sync').SyncExecutionResultDto>}
   */
  async executeSync(params = {}) {
    const runType = params.runType || 'full';
    const { startDate, endDate } = calculateSyncWindow(runType, params.startDate, params.endDate);
    const accountPropertyId =
      this.clientOverride?.accountPropertyId ||
      (process.env.GOOGLE_ANALYTICS_API_ID || '').trim() ||
      'unconfigured';
    const startedAt = new Date();
    const startTime = Date.now();

    const previousLog = await this.prisma.platformSyncLog.findFirst({
      where: { platform: 'ga4', accountPropertyId },
      orderBy: { startedAt: 'desc' },
    });
    const consecutiveFailures =
      previousLog?.status === 'failed' ? previousLog.consecutiveFailures : 0;
    const syncLog = await this.prisma.platformSyncLog.create({
      data: {
        platform: 'ga4',
        accountPropertyId,
        runType,
        windowStartDate: startDate,
        windowEndDate: endDate,
        status: 'running',
        consecutiveFailures,
        startedAt,
      },
    });

    try {
      const client = this.clientOverride || GoogleAnalyticsDataApiAdapter.fromEnvironment();
      const pageRows = await client.fetchPageMetrics({ startDate, endDate });
      const today = getVietnamTodayDateString();

      for (const row of pageRows) {
        await upsertPlatformMetricIdempotent(this.prisma, {
          platform: 'ga4',
          accountPropertyId,
          metricDate: row.metricDate,
          grain: 'page',
          pageUrlRaw: row.pagePath,
          pageViews: row.pageViews,
          avgTimeOnPageSec:
            row.pageViews > 0
              ? row.userEngagementDurationSeconds / row.pageViews
              : 0,
          isFinalized: row.metricDate < today,
        });
      }

      const completedAt = new Date();
      const durationMs = Date.now() - startTime;
      await this.prisma.platformSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'success',
          recordsSynced: pageRows.length,
          errorMessage: null,
          consecutiveFailures: 0,
          completedAt,
        },
      });

      return {
        logId: syncLog.id,
        platform: 'ga4',
        accountPropertyId,
        runType,
        windowStartDate: startDate,
        windowEndDate: endDate,
        recordsSynced: pageRows.length,
        status: 'success',
        errorMessage: null,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
      };
    } catch (error) {
      const completedAt = new Date();
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Lỗi đồng bộ GA4 không xác định.';
      const failedAttempts = consecutiveFailures + 1;

      await this.prisma.platformSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'failed',
          errorMessage,
          consecutiveFailures: failedAttempts,
          completedAt,
        },
      });

      return {
        logId: syncLog.id,
        platform: 'ga4',
        accountPropertyId,
        runType,
        windowStartDate: startDate,
        windowEndDate: endDate,
        recordsSynced: 0,
        status: 'failed',
        errorMessage,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
      };
    }
  }
}

/**
 * @param {'full' | 'light' | 'replay'} runType
 * @param {string | undefined} explicitStart
 * @param {string | undefined} explicitEnd
 */
function calculateSyncWindow(runType, explicitStart, explicitEnd) {
  if (Boolean(explicitStart) !== Boolean(explicitEnd)) {
    throw new Error('Cần cung cấp đủ ngày bắt đầu và ngày kết thúc khi đồng bộ GA4.');
  }

  if (explicitStart && explicitEnd) {
    if (!isValidDate(explicitStart) || !isValidDate(explicitEnd) || explicitStart > explicitEnd) {
      throw new Error('Khoảng ngày đồng bộ GA4 không hợp lệ.');
    }
    return { startDate: explicitStart, endDate: explicitEnd };
  }

  const endDate = getVietnamTodayDateString();
  const end = new Date(`${endDate}T00:00:00+07:00`);
  const daysBack = runType === 'light' ? 1 : 6;
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
    endDate,
  };
}

function getVietnamTodayDateString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((value) => value.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

module.exports = {
  GoogleAnalyticsSyncService,
  calculateSyncWindow,
  getVietnamTodayDateString,
};
