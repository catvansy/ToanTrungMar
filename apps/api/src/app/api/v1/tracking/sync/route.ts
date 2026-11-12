import { prisma } from '@toantrung/database';
import {
  GetSyncLogsQuerySchema,
  TriggerSyncRequestSchema,
} from '@toantrung/contracts/02-tracking-sync';
import { jsonError, jsonSuccess } from '@api/core/http';
import { requirePermissionSession } from '@api/core/permissions';
import { runTrackingSyncWorker } from '@api/modules/02-tracking-sync/workers/tracking-sync.worker';

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

    const logs = await prisma.platformSyncLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: parsedQuery.data.limit,
      skip: parsedQuery.data.offset,
    });

    const formatted = logs.map((l) => ({
      id: l.id,
      platform: l.platform,
      accountPropertyId: l.accountPropertyId,
      runType: l.runType,
      windowStartDate: l.windowStartDate,
      windowEndDate: l.windowEndDate,
      recordsSynced: l.recordsSynced,
      status: l.status,
      errorMessage: l.errorMessage,
      consecutiveFailures: l.consecutiveFailures,
      startedAt: l.startedAt.toISOString(),
      completedAt: l.completedAt ? l.completedAt.toISOString() : null,
      durationMs: l.completedAt ? l.completedAt.getTime() - l.startedAt.getTime() : null,
    }));

    return jsonSuccess({ logs: formatted, count: formatted.length });
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

    const { runType, startDate, endDate, forceMock } = parsedBody.data;
    const result = await runTrackingSyncWorker(prisma, runType, {
      startDate,
      endDate,
      forceMock,
    });

    return jsonSuccess(result, result.status === 'success' ? 200 : 502);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError('SYNC_EXECUTION_FAILED', `Lỗi thực thi đồng bộ: ${msg}`, 500);
  }
}
