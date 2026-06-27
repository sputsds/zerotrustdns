# [ZeroTrustDNS](https://github.com/cflover/zerotrustdns)

> 🇬🇧 [English](README.md) | 🇻🇳 Tiếng Việt

Bộ lọc DNS-over-HTTPS tự host trên Cloudflare Workers + D1.
Không cần terminal. Không cần cấu hình. Deploy trong vòng 2 phút.

---

## Tùy chọn 1 — Deploy một click (không nhận cập nhật)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cflover/zerotrustdns)

Không cần thiết lập. D1 database được tạo tự động.
Bạn sẽ KHÔNG nhận được các bản cập nhật trong tương lai.

---

## Tùy chọn 2 — Fork và Deploy (khuyến nghị)

Nhận cập nhật trong tương lai chỉ với một click qua Sync fork.

1. Fork repo về tài khoản của bạn
2. Vào Cloudflare Workers & Pages → Create → connect repo fork
3. Sửa ô **Deploy command** thành `npx wrangler deploy --x-provision`
4. Ấn **Deploy** → D1 tự tạo, Worker tự deploy
5. Sau này ấn **Sync fork** → Cloudflare tự redeploy bản mới nhất

---

## DoH endpoint

https://YOUR_WORKER_URL/dns-query

Hỗ trợ: iOS, Android, macOS, Windows, Firefox, Chrome.
Xem hướng dẫn cài đặt trong tab Privacy → Set up trên dashboard.

---

## Dashboard

| Tab | Mô tả |
|---|---|
| Privacy | Danh sách chặn + hướng dẫn cài đặt DoH |
| Allowlist | Các domain luôn được cho phép |
| Denylist | Các domain luôn bị chặn |
| Analytics | Thống kê truy vấn và tỷ lệ chặn |

---

## Biến môi trường tùy chọn

| Biến | Mặc định |
|---|---|
| UPSTREAM_DOH | https://security.cloudflare-dns.com/dns-query |
| MAX_LOG_DAYS | 30 |
| SYNC_TIMEOUT_MS | 30000 |
| MAX_LIST_DOMAINS | 500000 |
| BLOOM_FALSE_POSITIVE_RATE | 0.0001 |
