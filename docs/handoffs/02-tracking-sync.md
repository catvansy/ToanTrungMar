# Handoff 02-tracking-sync — Tracking nguồn và đồng bộ dữ liệu

Cập nhật: 12/11/2026.
Nhóm 2 — Cát Cần Sỹ.  
Nhánh Git: `feat/google-ads`.  
Kho mã nguồn GitHub: `https://github.com/truongvanlong1905/ToanTrungMar` (nhánh `main`).

---

## 1. Hiện trạng & Nguồn nghiệp vụ chuẩn
- Đã tiếp nhận và phân tích toàn diện **Tài liệu đặc tả BA: UC03 (Tracking nguồn và đồng bộ dữ liệu đa kênh)**.
- Chi tiết đặc tả nghiệp vụ đầy đủ đã được ghi nhận tại [docs/modules/02-tracking-sync.md](../modules/02-tracking-sync.md).
- Task nghiệm thu: [docs/tasks/m02/TASK-M02-GADS-SYNC.json](../tasks/m02/TASK-M02-GADS-SYNC.json).

---

## 2. Kết quả điều chỉnh chuyển sang kết nối trực tiếp Google Ads API v26
1. **Chuyển đổi sang Kết nối trực tiếp LIVE**:
   - `GoogleAdsApiAdapter` tại `apps/api/src/modules/02-tracking-sync/providers/google-ads/google-ads-api.adapter.ts`.
   - Nâng cấp phiên bản Google Ads API lên `v26` (phiên bản hoạt động năm 2026) kèm header `developer-token`.
   - Kết nối trực tiếp với tài khoản Google Ads Customer ID `721-544-7454` và Login Customer ID (MCC) `224-038-1899`.
   - Bóc tách chi tiết mã lỗi từ phản hồi của Google: phân biệt rõ ràng các trạng thái `CONNECTED`, `CUSTOMER_NOT_ENABLED` (tài khoản chưa kích hoạt trên Google Console) và `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`.
2. **Loại bỏ dữ liệu ảo và fixture thừa**:
   - Đã xóa bỏ file cấu hình ảo `tests/fixtures/02-tracking-sync/google-ads-test-account.json`.
   - Cập nhật script kiểm tra `verify-test-account.js` đọc trực tiếp từ `.env` thật, không dùng dữ liệu ảo.
3. **Đồng bộ với Frontend Web (`/tracking`)**:
   - `LiveSyncManager`: bỏ ép `forceMock: true`, chuyển sang `forceMock: false` để kích hoạt trực tiếp Google Ads API thật.
   - `TestAccountCard`: chuyển thành card hiển thị trạng thái kết nối trực tiếp tài khoản Google Ads (Target Customer ID: 721-544-7454, MCC: 224-038-1899), hiển thị thông báo thời gian thực từ Google.
   - Endpoint `GET /api/v1/tracking/sync` trả về thông tin `connection` động để UI cập nhật theo thời gian thực.
4. **Bằng chứng kiểm thử tự động**:
   - `typecheck` (contracts, database, api, web): PASS 100%.
   - `npm --workspace @toantrung/web run build`: PASS 100% (26 routes build sạch).
   - `node --test apps/api/src/modules/02-tracking-sync/__tests__/google-ads-sync.test.js`: PASS 4/4 tests.
   - `node --test tests/e2e/02-tracking-sync/tracking-sync.e2e.test.js`: PASS 6/6 tests.
   - Kết nối mạng OAuth Google Cloud: Đã xác thực thành công OAuth 2.0 Access Token và kết nối endpoint v26 thành công (status 200 listAccessibleCustomers).

---

## 3. Các điểm bất biến được bảo toàn
- Giữ nguyên 8 vai trò và ma trận `PERMISSIONS.md`. Quyền sửa tay Nguồn/Chiến dịch tiếp tục giữ mở tại [Q02](../decisions/OPEN_QUESTIONS.md#q02).
- Không lưu credential Google trên repo, log hay client; credential chỉ nằm trong `.env` server.
- Module 3 và Module 4 đọc số liệu đã chuẩn hóa qua `@toantrung/contracts/02-tracking-sync` hoặc `MetricsQueryService`.

---

## 4. Bước tiếp theo
- Vào Google Ads Console kích hoạt tài khoản `750-127-2192` (hoặc liên kết tài khoản con vào MCC `224-038-1899`) để tài khoản chuyển sang trạng thái ENABLED trên Google Ads.
- Khi tài khoản được kích hoạt, bấm "Đồng bộ trực tiếp ngay" trên Web để kéo số liệu chiến dịch thực tế vào hệ thống.

