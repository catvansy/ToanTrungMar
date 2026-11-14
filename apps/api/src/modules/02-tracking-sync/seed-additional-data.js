'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const PRISMA_DIR = path.join(REPO_ROOT, 'packages/database/prisma');

function resolveDbUrl() {
  const independentDbFile = path.join(PRISMA_DIR, 'independent_v2.db').replace(/\\/g, '/');
  const devDbFile = path.join(PRISMA_DIR, 'dev.db').replace(/\\/g, '/');
  const chosenDbFile =
    fs.existsSync(independentDbFile) && fs.statSync(independentDbFile).size > 0
      ? independentDbFile
      : fs.existsSync(devDbFile) && fs.statSync(devDbFile).size > 0
        ? devDbFile
        : independentDbFile;
  const defaultDbUrl = chosenDbFile.startsWith('/') ? `file://${chosenDbFile}` : `file:${chosenDbFile}`;
  return process.env.DATABASE_URL &&
    process.env.DATABASE_URL !== 'file:./dev.db' &&
    process.env.DATABASE_URL !== 'file:./independent_v2.db'
    ? process.env.DATABASE_URL
    : defaultDbUrl;
}

const dbUrl = resolveDbUrl();
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

const {
  upsertPlatformMetricIdempotent,
} = require(path.join(REPO_ROOT, 'packages/database/src/operations-runtime'));

async function addModule2Data() {
  console.log('[Module2Seed] Đang nạp thêm dữ liệu mới vào Module 2 (02-tracking-sync)...');

  // 1. Thêm các chiến dịch mới vào bảng campaigns
  const campFbRental = await prisma.campaign.upsert({
    where: {
      uq_campaign_platform_account_code: {
        platform: 'facebook',
        accountExternalId: 'FB-TT-FANPAGE',
        campaignCode: 'CMP-FB-LED-RENTAL-2026',
      },
    },
    update: {
      campaignName: 'Cho thuê Màn hình LED Sự kiện & Tiệc cưới 2026',
      dailyBudgetMicros: 2000000000000n, // 2,000,000 VND
      isActive: true,
    },
    create: {
      platform: 'facebook',
      accountExternalId: 'FB-TT-FANPAGE',
      campaignCode: 'CMP-FB-LED-RENTAL-2026',
      campaignName: 'Cho thuê Màn hình LED Sự kiện & Tiệc cưới 2026',
      utmCampaignSlug: 'led_rental_event_2026',
      currencyCode: 'VND',
      dailyBudgetMicros: 2000000000000n,
      isActive: true,
    },
  });

  const campZaloRetail = await prisma.campaign.upsert({
    where: {
      uq_campaign_platform_account_code: {
        platform: 'zalo',
        accountExternalId: 'ZALO-OA-TOANTRUNG',
        campaignCode: 'CMP-ZALO-LED-RETAIL',
      },
    },
    update: {
      campaignName: 'Bảng LED Chạy chữ & Hiệu ứng Cửa hàng Bán lẻ',
      dailyBudgetMicros: 1000000000000n, // 1,000,000 VND
      isActive: true,
    },
    create: {
      platform: 'zalo',
      accountExternalId: 'ZALO-OA-TOANTRUNG',
      campaignCode: 'CMP-ZALO-LED-RETAIL',
      campaignName: 'Bảng LED Chạy chữ & Hiệu ứng Cửa hàng Bán lẻ',
      utmCampaignSlug: 'zalo_led_retail',
      currencyCode: 'VND',
      dailyBudgetMicros: 1000000000000n,
      isActive: true,
    },
  });

  console.log(`  + Đã cập nhật 2 chiến dịch: ${campFbRental.campaignCode}, ${campZaloRetail.campaignCode}`);

  // 2. Thêm số liệu Facebook, GA4 và Search Console cho ngày 2026-11-10 và 2026-11-11
  const dates = ['2026-11-10', '2026-11-11'];
  let metricsCount = 0;

  for (const date of dates) {
    const isFinalized = date < '2026-11-11';

    // Facebook Ads: Chiến dịch Cho thuê LED (Grain: campaign)
    await upsertPlatformMetricIdempotent(prisma, {
      platform: 'fanpage',
      accountPropertyId: 'FB-TT-FANPAGE',
      metricDate: date,
      grain: 'campaign',
      campaignExternalId: campFbRental.campaignCode,
      campaignId: campFbRental.id,
      campaignName: campFbRental.campaignName,
      currencyCode: 'VND',
      spendMicros: 8500000000000n, // 8,500,000 VND
      dailyBudgetMicros: 2000000000000n,
      cpcMicros: 12000000000n, // 12,000 VND
      impressions: 48500,
      clicks: 710,
      conversionsMicros: 8000000n,
      fanpageEngagements: 1420,
      isFinalized,
    });
    metricsCount++;

    // GA4: Trang '/man-hinh-led-phong-hop' (Grain: page)
    await upsertPlatformMetricIdempotent(prisma, {
      platform: 'ga4',
      accountPropertyId: 'GA4-TOANTRUNG-MAIN',
      metricDate: date,
      grain: 'page',
      pageUrlRaw: 'https://toantrung.com.vn/man-hinh-led-phong-hop',
      pageViews: 1450,
      avgTimeOnPageSec: 182.5,
      isFinalized,
    });
    metricsCount++;

    // Search Console: Từ khóa SEO 'màn hình led phòng họp p3' (Grain: keyword)
    await upsertPlatformMetricIdempotent(prisma, {
      platform: 'search_console',
      accountPropertyId: 'https://toantrung.com.vn',
      metricDate: date,
      grain: 'keyword',
      keywordRaw: 'màn hình led phòng họp p3',
      pageUrlRaw: 'https://toantrung.com.vn/man-hinh-led-phong-hop',
      impressions: 3800,
      clicks: 295,
      avgPosition: 2.7,
      isFinalized,
    });
    metricsCount++;
  }

  console.log(`  + Đã nạp ${metricsCount} bản ghi số liệu Facebook, GA4 và Search Console.`);

  // 3. Thêm bản ghi lỗi webhook (UC03 E1)
  await prisma.webhookIntakeErrorLog.upsert({
    where: {
      uq_webhook_error_source_submission: {
        sourcePlatform: 'website_webhook',
        intakeSourceAccountKey: 'toantrung.com.vn',
        externalSubmissionId: 'SUB-ERR-20261111-001',
      },
    },
    update: {
      errorMessage: 'Thiếu số điện thoại liên hệ từ form yêu cầu báo giá nhanh.',
    },
    create: {
      sourcePlatform: 'website_webhook',
      intakeSourceAccountKey: 'toantrung.com.vn',
      externalSubmissionId: 'SUB-ERR-20261111-001',
      rawPayloadJson: JSON.stringify({
        fullName: 'Khách hàng Ẩn danh (Dữ liệu mẫu E1)',
        email: 'khachhang.test@toantrung.vn',
        phone: '',
        requestedProduct: 'Màn hình LED P3',
      }),
      errorCode: 'MISSING_PHONE',
      errorMessage: 'Thiếu số điện thoại liên hệ từ form yêu cầu báo giá nhanh.',
      retryCount: 1,
      isResolved: false,
    },
  });

  console.log(`  + Đã ghi nhận 1 bản ghi lỗi webhook mẫu (SUB-ERR-20261111-001) phục vụ kiểm thử Luồng E1.`);

  // 4. Phát thông báo hệ thống (Notification) tới các nhân sự có quyền theo dõi Tracking
  const targetRoles = ['ADMIN', 'MKT_LEAD', 'ADS', 'MKT_STAFF', 'BOD'];
  const targetUsers = await prisma.user.findMany({
    where: {
      role: { roleCode: { in: targetRoles } },
      isActive: true,
    },
    select: { id: true, fullName: true, role: { select: { roleCode: true } } },
  });

  const notificationData = targetUsers.map((u) => ({
    userId: u.id,
    title: 'Cập nhật dữ liệu đa kênh Module 2',
    summary: 'Đã nạp chiến dịch Facebook, Zalo cùng số liệu Facebook, GA4 và Search Console.',
    category: 'Đồng bộ số liệu',
    actionLabel: 'Xem Tracking & Đối soát',
    actionUrl: '/tracking',
  }));

  if (notificationData.length > 0) {
    await prisma.notification.createMany({
      data: notificationData,
    });
    console.log(`  + Đã gửi thông báo hệ thống tới ${notificationData.length} người dùng (${targetUsers.map(u => u.fullName).join(', ')}).`);
  }

  console.log('[Module2Seed] Hoàn tất nạp dữ liệu thành công!');
}

addModule2Data()
  .catch((err) => {
    console.error('[Module2Seed] Lỗi khi nạp dữ liệu:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
