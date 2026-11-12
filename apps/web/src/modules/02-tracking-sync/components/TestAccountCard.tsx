'use client';

import React from 'react';
import { ExternalLink, KeyRound, ShieldCheck, Tag } from 'lucide-react';

interface TestAccountCardProps {
  className?: string;
  clientId?: string;
  managerId?: string;
  provider?: string;
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
  clientId = '750-127-2192',
  managerId = '224-038-1899',
  provider = 'LIVE (Tài khoản thử nghiệm)',
}: TestAccountCardProps) {
  const displayClientId = format10Digits(clientId);
  const displayManagerId = format10Digits(managerId);
  const isLive = provider.toUpperCase().includes('LIVE');
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Google Ads Test Account</h3>
            <p className="text-[11px] text-slate-500">Môi trường kiểm thử Google Ads API v18 dành cho Module 02</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
          <Tag className="h-3 w-3" />
          Tài khoản thử nghiệm · Test Account
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Test Client Customer ID</p>
          <p className="mt-1 font-mono text-sm font-bold text-blue-700">{displayClientId}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Mục tiêu truy vấn GAQL chính</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Test Manager ID (MCC)</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-800">{displayManagerId}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Login Customer ID xác thực</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Múi giờ &amp; Tiền tệ</p>
          <p className="mt-1 text-xs font-semibold text-slate-800">GMT+07:00 · VND (₫)</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Việt Nam (Asia/Ho_Chi_Minh)</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Chế độ đồng bộ</p>
          <div className="mt-1 flex items-center gap-1.5">
            <ShieldCheck className={`h-4 w-4 ${isLive ? 'text-blue-600' : 'text-emerald-600'}`} />
            <span className={`text-xs font-semibold ${isLive ? 'text-blue-700' : 'text-emerald-700'}`}>{provider}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-500">Chống ghi đè &amp; không trừ phí thẻ</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          Tài khoản kiểm thử không phân phối quảng cáo thật hay phát sinh chi phí, bảo đảm an toàn dữ liệu vận hành.
        </span>
        <a
          href="https://developers.google.com/google-ads/api/docs/first-call/test-accounts"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-800 hover:underline"
        >
          Hướng dẫn tạo tài khoản Google <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
