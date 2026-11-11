# Handoff 02-tracking-sync — Tracking nguồn và đồng bộ dữ liệu

Cập nhật: 11/11/2026.
Nhóm 2 — Cát Cần Sỹ.  
Nhánh Git: `feature/google-ads`.  
Kho mã nguồn GitHub: `https://github.com/truongvanlong1905/ToanTrungMar` (nhánh `main`).

---

## 1. Hiện trạng & Nguồn nghiệp vụ chuẩn
- Đã tiếp nhận và phân tích toàn diện **Tài liệu đặc tả BA: UC03 (Tracking nguồn và đồng bộ dữ liệu đa kênh)**.
- Chi tiết đặc tả nghiệp vụ đầy đủ đã được ghi nhận tại [docs/modules/02-tracking-sync.md](../modules/02-tracking-sync.md).
- Task nghiệm thu: [docs/tasks/m02/TASK-M02-GADS-SYNC.json](../tasks/m02/TASK-M02-GADS-SYNC.json).

---

## 2. Kết quả triển khai tích hợp Google Ads (Task M02-GADS-SYNC-01)
1. **Mock Adapter & Dữ liệu giả lập**:
   - `GoogleAdsMockAdapter` tại `apps/api/src/modules/02-tracking-sync/providers/google-ads/google-ads-mock.adapter.ts`.
   - Sinh dữ liệu giả lập chuẩn xác định (deterministic hash) bám sát 25 sản phẩm Toàn Trung: 3 chiến dịch, 7 từ khóa (EXACT, PHRASE, BROAD).
   - Mô phỏng đầy đủ các kịch bản: `AUTH_ERROR`, `RATE_LIMIT`, `TIMEOUT`, `EMPTY`.
2. **Google Ads API Read-Only Adapter (GAQL v18/v19)**:
   - `GoogleAdsApiAdapter` tại `apps/api/src/modules/02-tracking-sync/providers/google-ads/google-ads-api.adapter.ts`.
   - Chỉ đọc (read-only): truy vấn chi phí, ngân sách, CPC, clicks, impressions, conversions theo chuẩn GAQL; không sửa đổi chiến dịch/ngân sách/ads.
   - Quản lý token tự động qua OAuth/Service Account, hỗ trợ Customer ID 10 số và MCC login-customer-id.
3. **Chuẩn hóa & Lũy đẳng (Canonical Metric Store - Kho D3)**:
   - Bộ chuyển đổi `normalizeGoogleAdsCampaignRow` và `normalizeGoogleAdsKeywordRow` bảo toàn tiền tệ bằng `BigInt` micros (1 VND = 1,000,000 micros) và currency code `VND`.
   - Phân biệt ngày chưa chốt: ngày quá khứ mang cờ `isFinalized: true`; ngày hôm nay mang cờ `isFinalized: false`.
   - `SyncOrchestratorService` ghi nhận lịch sử đồng bộ vào `platform_sync_logs`, chống trùng qua `upsertPlatformMetricIdempotent`.
   - Cảnh báo tự động (UC03 E2): khi thất bại 3 lần liên tiếp, tự động dispatch notification cảnh báo Admin.
4. **Hợp đồng dữ liệu (Contracts) & API Endpoints**:
   - DTOs công bố tại `packages/contracts/src/02-tracking-sync/` (`metrics.dto.ts`, `sync.dto.ts`).
   - Endpoint đọc số liệu chuẩn: `GET /api/v1/tracking/metrics` (bảo vệ bởi `DASHBOARD_VIEW` / `TRACKING_ADS_OPTIMIZE`).
   - Endpoint kích hoạt đồng bộ: `GET / POST /api/v1/tracking/sync` (bảo vệ bởi `TRACKING_ADS_OPTIMIZE`).
   - CLI runner độc lập: `apps/api/src/workers/tracking-sync-cli.js` hỗ trợ cron 02:00 (full 30d) và 11:00/17:00 (light 2d).
5. **Bằng chứng kiểm thử tự động**:
   - `typecheck` (contracts, database, api, web): PASS 100%.
   - `node --test apps/api/src/modules/02-tracking-sync/__tests__/google-ads-sync.test.js`: PASS 4/4 tests (Unit mock, Normalizer, Lũy đẳng lặp không tăng số dòng, EMPTY kết quả rỗng không báo lỗi, mô phỏng lỗi 3 lần liên tiếp gửi notification, MetricsQueryService).
   - `node --test tests/e2e/02-tracking-sync/tracking-sync.e2e.test.js`: PASS 6/6 tests (Chạy CLI với file input fixture, đối soát DB, lũy đẳng lặp E2E, Replay tùy biến ngày, hợp đồng M03/M04, mô phỏng lỗi & tự phục hồi).
   - `test:tooling` & `test:core`: PASS 100% không suy thoái.
   - `check:scope`: PASS 26 file trong phạm vi task.

---

## 3. Các điểm bất biến được bảo toàn
- Giữ nguyên 8 vai trò và ma trận `PERMISSIONS.md`. Quyền sửa tay Nguồn/Chiến dịch tiếp tục giữ mở tại [Q02](../decisions/OPEN_QUESTIONS.md#q02).
- Không lưu credential Google trên repo, log hay client; mặc định chạy chế độ Mock an toàn cục bộ.
- Module 3 và Module 4 đọc số liệu đã chuẩn hóa qua `@toantrung/contracts/02-tracking-sync` hoặc `MetricsQueryService`, không gọi Google Ads trực tiếp.

---

## 4. Bước tiếp theo
- Kết nối Cloud project và tài khoản Google Ads thật sau khi Admin/Cloud Manager cấp Customer ID và quyền Explorer Access.
- Tích hợp gọi Luồng A2 (tra lại gclid) và Luồng D (đối soát số lead form T-1) sau khi job đồng bộ Google Ads hoàn tất.
