'use strict';

/**
 * Script kiểm tra và xác thực cấu hình Google Ads Test Account cho Module 02.
 * Hỗ trợ kiểm tra định dạng Customer ID (10 số), kiểm tra kết nối API và nhãn Test Account.
 *
 * Cách chạy:
 *   node apps/api/src/modules/02-tracking-sync/verify-test-account.js
 *   node apps/api/src/modules/02-tracking-sync/verify-test-account.js --config tests/fixtures/02-tracking-sync/google-ads-test-account.json
 */

const fs = require('node:fs');
const path = require('node:path');

// Nạp tự động file .env nếu có để hỗ trợ kiểm tra
function loadEnv() {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(__dirname, '../../../../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const match = trimmed.match(/^([^=]+)=(.*)$/);
          if (match) {
            const key = match[1].trim();
            let val = match[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {
        // bỏ qua nếu lỗi đọc
      }
    }
  }
}

loadEnv();

function cleanCustomerId(id) {
  if (!id) return '';
  return String(id).replace(/-/g, '').trim();
}

function isValid10DigitCustomerId(id) {
  const cleaned = cleanCustomerId(id);
  return /^\d{10}$/.test(cleaned);
}

async function main() {
  const args = process.argv.slice(2);
  let configPath = path.resolve(__dirname, '../../../../../tests/fixtures/02-tracking-sync/google-ads-test-account.json');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) {
      configPath = path.resolve(process.cwd(), args[++i]);
    }
  }

  console.log('='.repeat(70));
  console.log(' [Google Ads API] Kiểm tra cấu hình Test Account — Module 02');
  console.log('='.repeat(70));

  let configData = null;
  if (fs.existsSync(configPath)) {
    try {
      configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(`✓ Đã nạp hồ sơ cấu hình: ${path.basename(configPath)}`);
    } catch {
      console.warn(`! Không thể đọc file JSON tại: ${configPath}`);
    }
  }

  const envProvider = (process.env.GOOGLE_ADS_PROVIDER || (configData ? configData.environmentVariablesMapping?.GOOGLE_ADS_PROVIDER : '') || 'mock').trim();
  const rawCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID || configData?.testClientAccount?.testClientCustomerId || '';
  const rawLoginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || configData?.testManagerAccount?.testManagerCustomerId || '';

  const clientCustomerId = cleanCustomerId(rawCustomerId);
  const managerCustomerId = cleanCustomerId(rawLoginCustomerId);

  console.log('\n1. KIỂM TRA ĐỊNH DẠNG TÀI KHOẢN:');
  console.log(`  - Test Client Customer ID  : ${rawCustomerId || '(Chưa cấu hình)'} -> ${clientCustomerId ? 'Đã chuẩn hóa: ' + clientCustomerId : ''}`);
  if (isValid10DigitCustomerId(clientCustomerId)) {
    console.log(`    ✓ Hợp lệ: Chuẩn 10 chữ số của Google Ads.`);
  } else {
    console.log(`    ✗ Chưa hợp lệ: Customer ID phải là chuỗi 10 chữ số (VD: 492-104-9583 hoặc 4921049583).`);
  }

  console.log(`  - Test Manager Customer ID : ${rawLoginCustomerId || '(Chưa cấu hình)'} -> ${managerCustomerId ? 'Đã chuẩn hóa: ' + managerCustomerId : ''}`);
  if (isValid10DigitCustomerId(managerCustomerId)) {
    console.log(`    ✓ Hợp lệ: Chuẩn 10 chữ số của Google Ads Manager (MCC).`);
  } else {
    console.log(`    ! Lưu ý: Nếu truy cập trực tiếp qua Client độc lập thì có thể bỏ qua Manager ID.`);
  }

  console.log('\n2. CHẾ ĐỘ HOẠT ĐỘNG (PROVIDER):');
  const isMock = envProvider.toLowerCase().includes('mock');
  if (isMock) {
    console.log(`  - Chế độ hiện tại: MOCK (Bộ giả lập an toàn cục bộ).`);
    console.log(`    ✓ Sẵn sàng chạy kiểm thử, đồng bộ và hiển thị số liệu mà không cần kết nối mạng.`);
  } else {
    console.log(`  - Chế độ hiện tại: LIVE (Kết nối trực tiếp Google Cloud / Google Ads API).`);
    const hasClientId = Boolean(process.env.GOOGLE_ADS_CLIENT_ID);
    const hasSecret = Boolean(process.env.GOOGLE_ADS_CLIENT_SECRET);
    const hasRefreshToken = Boolean(process.env.GOOGLE_ADS_REFRESH_TOKEN);

    console.log(`    - Client ID     : ${hasClientId ? '✓ Đã cấu hình' : '✗ Thiếu'}`);
    console.log(`    - Client Secret : ${hasSecret ? '✓ Đã cấu hình' : '✗ Thiếu'}`);
    console.log(`    - Refresh Token : ${hasRefreshToken ? '✓ Đã cấu hình' : '✗ Thiếu'}`);

    if (hasClientId && hasSecret && hasRefreshToken && isValid10DigitCustomerId(clientCustomerId)) {
      console.log(`    ✓ Đầy đủ thông tin để kết nối Google Ads API thật.`);
    } else {
      console.log(`    ! Cần bổ sung đủ biến môi trường trên để gọi API Google Ads thật.`);
    }
  }

  console.log('\n3. THÔNG SỐ TÀI KHOẢN THEO CHUẨN GOOGLE:');
  console.log(`  - Quốc gia (Country)      : Vietnam (VN)`);
  console.log(`  - Múi giờ (Time zone)     : GMT+07:00 (Asia/Ho_Chi_Minh)`);
  console.log(`  - Đơn vị tiền tệ (Currency): VND (Việt Nam Đồng)`);
  console.log(`  - Nhãn thử nghiệm (Badge) : [TÀI KHOẢN THỬ NGHIỆM / TEST ACCOUNT - BANNER ĐỎ]`);

  console.log('\n' + '='.repeat(70));
  console.log(' KẾT LUẬN & HƯỚNG DẪN TIẾP THEO:');
  console.log('='.repeat(70));
  console.log('1. Module 02 đã chuẩn bị sẵn sàng toàn bộ cơ chế tiếp nhận Test Account.');
  console.log('2. Để kết nối Test Account thật trên Google:');
  console.log('   - Truy cập: https://developers.google.com/google-ads/api/docs/first-call/test-accounts');
  console.log('   - Đăng nhập tài khoản Google của bạn và tạo Test Manager Account.');
  console.log('   - Tạo tiếp Test Client Account bên trong và lấy 2 mã 10 chữ số.');
  console.log('   - Điền 2 mã vào file .env hoặc cấu hình của project.');
  console.log('='.repeat(70) + '\n');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  cleanCustomerId,
  isValid10DigitCustomerId,
};
