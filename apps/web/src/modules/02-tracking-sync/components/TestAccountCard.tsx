'use client';

import React, { useMemo } from 'react';
import {
  CircleDollarSign,
  KeyRound,
  Layers,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type {
  PublicGoogleAdsConnectionInfoDto,
  PublicPlatformMetricsSummaryDto,
} from '../types';

interface TestAccountCardProps {
  className?: string;
  provider?: string;
  connection?: PublicGoogleAdsConnectionInfoDto;
  summary?: PublicPlatformMetricsSummaryDto | null;
  onRefresh?: () => void;
  isLoading?: boolean;
}

function formatVnd(val: number): string {
  if (!Number.isFinite(val) || val === 0) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(val)) + ' ₫';
}

export function TestAccountCard({
  className = '',
  provider = 'LIVE (Kết nối trực tiếp)',
  connection,
  summary,
  onRefresh,
  isLoading = false,
}: TestAccountCardProps) {
  const isLive = (connection?.provider || provider).toUpperCase().includes('LIVE');
  const isConnected = connection?.isConnected ?? false;
  const statusLabel =
    connection?.statusLabel ||
    (isLive ? (isLoading ? 'Đang kiểm tra kết nối' : 'Chưa kiểm tra kết nối') : 'Bộ giả lập Mock');
  const apiVersion = connection?.apiVersion || 'v26';

  // Không dùng metrics lịch sử làm danh sách chiến dịch khi thẻ đang ở chế độ LIVE.
  const campaignsList = useMemo(() => {
    if (isLive) {
      return (connection?.liveCampaigns || []).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        dailyBudgetVnd: c.dailyBudgetVnd,
        costVnd: c.costVnd,
        clicks: c.clicks,
        impressions: c.impressions,
        conversions: c.conversions,
      }));
    }

    if (summary?.metrics && summary.metrics.length > 0) {
      const map = new Map<
        string,
        {
          id: string;
          name: string;
          status: string;
          dailyBudgetVnd: number;
          costVnd: number;
          clicks: number;
          impressions: number;
          conversions: number;
        }
      >();

      for (const m of summary.metrics) {
        const id = m.campaignExternalId || 'UNKNOWN';
        const name = m.campaignName || id;
        const budgetVnd = Number(m.dailyBudget?.formattedDecimal || 0);
        const costVnd = Number(m.spend?.formattedDecimal || 0);

        const existing = map.get(id);
        if (!existing) {
          map.set(id, {
            id,
            name,
            status: 'ENABLED',
            dailyBudgetVnd: budgetVnd,
            costVnd,
            clicks: m.clicks,
            impressions: m.impressions,
            conversions: m.conversions,
          });
        } else {
          existing.costVnd += costVnd;
          existing.clicks += m.clicks;
          existing.impressions += m.impressions;
          existing.conversions += m.conversions;
          if (budgetVnd > 0) existing.dailyBudgetVnd = budgetVnd;
        }
      }
      return Array.from(map.values());
    }

    return [];
  }, [connection?.liveCampaigns, isLive, summary?.metrics]);

  const totalDailyBudgetVnd = useMemo(() => {
    return campaignsList.reduce((acc, c) => acc + c.dailyBudgetVnd, 0);
  }, [campaignsList]);

  const totalCostVnd = useMemo(() => {
    return campaignsList.reduce((acc, c) => acc + c.costVnd, 0);
  }, [campaignsList]);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Tài khoản Google Ads kết nối trực tiếp</h3>
            <p className="text-[11px] text-slate-500">
              Đồng bộ dữ liệu đa kênh qua Google Ads API {apiVersion} · Xác thực OAuth 2.0
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-blue-700 disabled:opacity-50"
              title="Đồng bộ lại danh sách chiến dịch và số liệu từ Google Ads API"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              Đồng bộ chiến dịch mới
            </button>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              isConnected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : connection?.status === 'CUSTOMER_NOT_ENABLED'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-blue-200 bg-blue-50 text-blue-700'
            }`}
          >
            <Radio className={`h-3 w-3 ${isConnected ? 'animate-pulse' : ''} text-current`} />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Grid 3 chỉ số tổng quan tài khoản */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Ô 1: Đang kết nối chưa */}
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Trạng thái kết nối</p>
          <div className="mt-1 flex items-center gap-1.5">
            {isConnected ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                </span>
                <span className="text-sm font-bold text-emerald-700">Đã kết nối trực tiếp</span>
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-sm font-bold text-amber-700">Chưa kết nối</span>
              </>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {isConnected ? `Google Ads API ${apiVersion} · Hoạt động` : 'Cần kiểm tra cấu hình kết nối'}
          </p>
        </div>

        {/* Ô 2: Tổng số chiến dịch hiện có */}
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Tổng chiến dịch</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Layers className="h-4 w-4 shrink-0 text-violet-600" />
            <p className="text-sm font-bold text-slate-900">
              {campaignsList.length > 0
                ? `${campaignsList.length} chiến dịch`
                : isLoading
                  ? 'Đang tải'
                  : 'Chưa có chiến dịch'}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            Cập nhật từ Google Ads API
          </p>
        </div>

        {/* Ô 3: Tổng tiền ngân sách phân bổ */}
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Tổng ngân sách phân bổ</p>
          <div className="mt-1 flex items-center gap-1.5">
            <CircleDollarSign className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-sm font-bold text-emerald-700">
              {campaignsList.length > 0 ? `${formatVnd(totalDailyBudgetVnd)} / ngày` : '—'}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {campaignsList.length > 0
              ? `Tổng chi tiêu: ${formatVnd(totalCostVnd)}`
              : 'Chưa có dữ liệu ngân sách'}
          </p>
        </div>
      </div>

      {/* BẢNG DANH SÁCH CHI TIẾT TỪNG CHIẾN DỊCH & CHI PHÍ TƯƠNG ỨNG */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-700" />
            <span className="text-xs font-bold text-slate-800">
              Danh sách chiến dịch &amp; Khoản tiền chi tiêu của tài khoản
            </span>
            {campaignsList.length > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                {campaignsList.length} chiến dịch
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Tự động phát hiện khi tạo thêm chiến dịch mới trên Google Ads
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Chiến dịch</th>
                <th className="px-4 py-2.5">Mã chiến dịch (ID)</th>
                <th className="px-4 py-2.5">Trạng thái</th>
                <th className="px-4 py-2.5 text-right">Ngân sách hàng ngày</th>
                <th className="px-4 py-2.5 text-right">Chi phí đã chi tiêu</th>
                <th className="px-4 py-2.5 text-center">Tương tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaignsList.length > 0 ? (
                campaignsList.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      <span className="font-semibold text-blue-800">{c.name}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                        {c.id}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {c.status === 'ENABLED' ? 'Đang chạy' : c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                      {formatVnd(c.dailyBudgetVnd)} / ngày
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">
                      {formatVnd(c.costVnd)}
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-500">
                      {c.clicks} click · {c.impressions} hiển thị
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                    {isLoading
                      ? 'Đang tải dữ liệu Google Ads...'
                      : 'Chưa có chiến dịch được trả về từ tài khoản Google Ads.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
