'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { apiRequest } from '@/core/http/client';
import type {
  PublicPlatformSyncLogDto,
  PublicSyncExecutionResultDto,
} from '../types';

interface GoogleAnalyticsSyncManagerProps {
  logs: PublicPlatformSyncLogDto[];
  isLoadingLogs: boolean;
  hasLogsError: boolean;
  onRefreshLogs: () => void;
  onSyncCompleted: () => void;
  csrfToken?: string;
}

export function GoogleAnalyticsSyncManager({
  logs,
  isLoadingLogs,
  hasLogsError,
  onRefreshLogs,
  onSyncCompleted,
  csrfToken,
}: GoogleAnalyticsSyncManagerProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  async function handleSync() {
    setIsSyncing(true);
    setFeedback(null);
    try {
      const result = await apiRequest<PublicSyncExecutionResultDto>('/api/v1/tracking/sync', {
        method: 'POST',
        body: { platform: 'ga4', runType: 'full' },
        csrfToken,
      });
      setFeedback({
        type: 'success',
        message: `Đồng bộ GA4 thành công: ${result.recordsSynced} dòng theo trang (${result.windowStartDate} đến ${result.windowEndDate}).`,
      });
      onSyncCompleted();
    } catch (error: unknown) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Không thể đồng bộ Google Analytics 4.',
      });
      onRefreshLogs();
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Google Analytics 4</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Đồng bộ lượt xem trang và thời gian tương tác trung bình của Property đã cấu hình.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSyncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ 7 ngày'}
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            feedback.type === 'error'
              ? 'bg-rose-50 text-rose-800'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">Lịch sử đồng bộ GA4</p>
          <button
            type="button"
            onClick={onRefreshLogs}
            disabled={isLoadingLogs}
            aria-label="Làm mới lịch sử đồng bộ GA4"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {logs.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {logs.slice(0, 5).map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]">
                <span className="text-slate-600">
                  {new Date(log.startedAt).toLocaleString('vi-VN')} · {log.recordsSynced} dòng
                </span>
                <span
                  className={`font-semibold ${
                    log.status === 'success'
                      ? 'text-emerald-700'
                      : log.status === 'failed'
                        ? 'text-rose-700'
                        : 'text-blue-700'
                  }`}
                >
                  {log.status === 'success'
                    ? 'Thành công'
                    : log.status === 'failed'
                      ? 'Thất bại'
                      : 'Đang chạy'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Unplug className="h-3 w-3" />
            {isLoadingLogs
              ? 'Đang tải lịch sử...'
              : hasLogsError
                ? 'Không tải được lịch sử đồng bộ GA4.'
                : 'Chưa có lần đồng bộ GA4 nào.'}
          </p>
        )}
      </div>
    </section>
  );
}
