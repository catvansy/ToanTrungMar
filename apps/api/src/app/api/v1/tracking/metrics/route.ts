import { prisma } from '@toantrung/database';
import {
  GetPlatformDailyMetricsQuerySchema,
  type PublicPlatformMetricsSummaryDto,
} from '@toantrung/contracts/02-tracking-sync';
import { jsonError, jsonSuccess } from '@api/core/http';
import { requirePermissionSession } from '@api/core/permissions';
import { MetricsQueryService } from '@api/modules/02-tracking-sync/services/metrics-query.service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'DASHBOARD_VIEW', { requireCsrf: false });
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsedQuery = GetPlatformDailyMetricsQuerySchema.safeParse(params);

    if (!parsedQuery.success) {
      return jsonError(
        'INVALID_QUERY_PARAMS',
        'Tham số truy vấn số liệu không hợp lệ.',
        400,
        parsedQuery.error.format(),
      );
    }

    if (parsedQuery.data.platform === 'ga4') {
      const propertyId = (process.env.GOOGLE_ANALYTICS_API_ID || '').trim();
      if (!/^\d+$/.test(propertyId)) {
        return jsonError(
          'GA4_PROPERTY_NOT_CONFIGURED',
          'GA4 Property ID chưa được cấu hình phía máy chủ.',
          503,
        );
      }
      if (parsedQuery.data.accountPropertyId && parsedQuery.data.accountPropertyId !== propertyId) {
        return jsonError(
          'GA4_PROPERTY_NOT_ALLOWED',
          'Chỉ được truy vấn GA4 Property ID đã cấu hình.',
          403,
        );
      }
      parsedQuery.data.accountPropertyId = propertyId;
    }

    const queryService = new MetricsQueryService(prisma);
    const summary = await queryService.getMetricsSummary(parsedQuery.data);
    const { accountPropertyId, metrics, ...publicSummary } = summary;
    void accountPropertyId;
    const publicMetrics = metrics.map((metric) => {
      const {
        accountPropertyId: metricAccountPropertyId,
        dimensionFingerprint,
        ...publicMetric
      } = metric;
      void metricAccountPropertyId;
      void dimensionFingerprint;
      return publicMetric;
    });
    const publicResponse: PublicPlatformMetricsSummaryDto = {
      ...publicSummary,
      metrics: publicMetrics,
    };

    return jsonSuccess(publicResponse);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError('METRICS_QUERY_FAILED', `Lỗi truy vấn số liệu: ${msg}`, 500);
  }
}
