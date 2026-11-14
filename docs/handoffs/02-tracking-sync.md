# Handoff 02-tracking-sync

Cập nhật: 13/11/2026.

## Trạng thái

- Google Ads flow hiện có được giữ nguyên; phần bổ sung hiện tại là GA4 Data API cho task `M02-GA4-DATA-API-01`.
- GA4 dùng Property ID `564242708`, OAuth riêng phía server với `analytics.readonly`; không dùng refresh token Google Ads.
- API đồng bộ lượt xem trang và thời gian tương tác trung bình mỗi lượt xem theo trang/ngày. Full sync lấy 7 ngày; dữ liệu ghi idempotent vào metric/log hiện có, không cần migration.
- Overview hiển thị metric GA4 đã đồng bộ hoặc trạng thái loading/lỗi/rỗng. Tab Đồng bộ có trạng thái cấu hình, lịch sử và nút đồng bộ GA4 riêng.
- Chưa xác minh kết nối Google thật. Cần cấu hình `GOOGLE_ANALYTICS_CLIENT_ID`, `GOOGLE_ANALYTICS_CLIENT_SECRET`, `GOOGLE_ANALYTICS_REFRESH_TOKEN` phía server; không đưa credentials vào client, Git hoặc log.
- Google Ads LIVE đã được kiểm tra lại ngày 13/11/2026: OAuth/API kết nối thành công; API trả 3 campaign `ENABLED`, nhưng click và impression đều bằng 0. Đồng bộ light và full đều `success` nhưng nhận 0 metric rows; DB vẫn có 4 campaign-metric rows và 0 keyword-metric rows trong cửa sổ full. Chênh lệch 4 campaign DB / 3 campaign LIVE có thể là bản ghi lịch sử; không xóa dữ liệu.

## Kiểm tra đã chạy

- `npm.cmd run typecheck` — PASS.
- `npm.cmd --workspace @toantrung/web run build` — PASS; build có cảnh báo `Critical dependency` từ `apps/api/src/modules/02-tracking-sync/index.js`.
- `node --test apps/api/src/modules/02-tracking-sync/__tests__/google-analytics-sync.test.js` — PASS, 8/8.
- `node apps/api/src/workers/tracking-sync-cli.js --type light` — PASS, LIVE, log #17, cửa sổ `2026-11-11`–`2026-11-13`, 0 rows.
- `node apps/api/src/workers/tracking-sync-cli.js --type full` — PASS, LIVE, log #18, cửa sổ `2026-10-13`–`2026-11-13`, 0 rows.
- Read-only Google Ads health/campaign check — PASS; 3 campaign `ENABLED`, 0 clicks, 0 impressions.
- Read-only DB check after full sync — latest log #18 success/0 rows; 4 campaign metric rows, 0 keyword metric rows, 4 campaign records in the account scope.
- `npm.cmd run check:docs` — PASS.
- `npm.cmd run check:scope -- --task docs/tasks/m02/M02-GA4-DATA-API-01.json --files "apps\api\src\app\api\v1\tracking\sync\route.ts" "apps\api\src\app\api\v1\tracking\metrics\route.ts" "apps\api\src\modules\02-tracking-sync\index.ts" "apps\api\src\modules\02-tracking-sync\providers\google-analytics\google-analytics-data.adapter.js" "apps\api\src\modules\02-tracking-sync\services\google-analytics-sync.service.js" "apps\api\src\modules\02-tracking-sync\__tests__\google-analytics-sync.test.js" "apps\web\src\app\(workspace)\tracking\page.tsx" "apps\web\src\modules\02-tracking-sync\components\GoogleAnalyticsSyncManager.tsx" "apps\web\src\modules\02-tracking-sync\index.ts" "packages\contracts\src\02-tracking-sync\sync.dto.ts" "docs\modules\02-tracking-sync.md" "docs\tasks\m02\M02-GA4-DATA-API-01.json" "docs\handoffs\02-tracking-sync.md"` — PASS cho 13 đường dẫn.
- `npm.cmd run check:scope -- --task docs/tasks/m02/M02-GA4-DATA-API-01.json` — FAIL do các thay đổi ngoài task đang có sẵn: `apps/api/src/workers/tracking-sync-cli.js`, `apps/web/package.json`, `package-lock.json`, `packages/database/scripts/seed.js`. Đã giữ nguyên.
- `git diff --check` — PASS sau khi cập nhật handoff.

## Bước tiếp theo

1. Cấu hình riêng OAuth GA4 có scope `analytics.readonly` trong môi trường server.
2. Đồng bộ thử có chủ đích, kiểm tra log và metric thực tế trên Property đã xác nhận.
