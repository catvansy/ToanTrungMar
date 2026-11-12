'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Radio, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { GoogleAdsConnectionInfoDto } from '../types';

interface TestAccountCardProps {
  className?: string;
  clientId?: string;
  managerId?: string;
  provider?: string;
  connection?: GoogleAdsConnectionInfoDto;
}

function format10Digits(id?: string): string {
  if (!id) return '';
  const digits = id.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return id;
}

export function TestAccountCard({
  className = '',
  clientId = '721-544-7454',
  managerId = '224-038-1899',
  provider = 'LIVE (Kết nối trực tiếp)',
  connection,
}: TestAccountCardProps) {
  const targetId = connection?.targetCustomerId || clientId;
  const loginId = connection?.loginCustomerId || managerId;
  const displayClientId = format10Digits(targetId);
  const displayManagerId = format10Digits(loginId);
  const isLive = (connection?.provider || provider).toUpperCase().includes('LIVE');
  const isConnected = connection ? connection.isConnected : false;
  const statusLabel = connection?.statusLabel || (isLive ? 'Kết nối trực tiếp (Live)' : 'Bộ giả lập Mock');
  const apiVersion = connection?.apiVersion || 'v26';

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
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
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              isConnected
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : connection?.status === 'CUSTOMER_NOT_ENABLED'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-blue-200 bg-blue-50 text-blue-700'
            }`}
          >
            <Radio className="h-3 w-3 animate-pulse text-current" />
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Target Client Customer ID</p>
          <p className="mt-1 font-mono text-sm font-bold text-blue-700">{displayClientId}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Tài khoản Google Ads nhận truy vấn GAQL</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Manager Customer ID (MCC)</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-800">{displayManagerId}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Login Customer ID cấp quyền xác thực</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Múi giờ &amp; Tiền tệ</p>
          <p className="mt-1 text-xs font-semibold text-slate-800">GMT+07:00 · VND (₫)</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Việt Nam (Asia/Ho_Chi_Minh)</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Giao thức &amp; Phiên bản</p>
          <div className="mt-1 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">REST API {apiVersion} (OAuth 2.0)</span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">Chế độ đồng bộ: Trực tiếp</p>
        </div>
      </div>

      {connection?.message && (
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-lg p-3 text-xs ${
            isConnected
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : connection?.status === 'CUSTOMER_NOT_ENABLED'
                ? 'border border-amber-200 bg-amber-50 text-amber-900'
                : 'border border-blue-200 bg-blue-50 text-blue-900'
          }`}
        >
          {isConnected ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : connection?.status === 'CUSTOMER_NOT_ENABLED' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {isConnected
                ? 'Kết nối trực tiếp thành công'
                : connection?.status === 'CUSTOMER_NOT_ENABLED'
                  ? 'Tài khoản cần kích hoạt trên Google Ads Console'
                  : 'Trạng thái kết nối Google Ads API'}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed opacity-95">{connection.message}</p>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          Ưu tiên kết nối trực tiếp, chuẩn hóa BigInt micros sang VND và tự động phát hiện trạng thái tài khoản.
        </span>
        <a
          href="https://ads.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-800 hover:underline"
        >
          Mở Google Ads Console <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

