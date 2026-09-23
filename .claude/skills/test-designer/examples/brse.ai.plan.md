# Test plan — brse.ai

> Generated from exploration of `https://brse.ai` (see ./exploration.md).
> Method: black-box, risk-based. Status: ⬜ chưa chạy · ✅ pass · ❌ fail · ⏭️ skip

## Phạm vi & môi trường
- Target: `https://brse.ai` (redirect → `/login`)
- Môi trường: production (login page, công khai)
- Tài khoản test: chưa có → chỉ phủ phần công khai (login + validation). Có tài khoản thì mở rộng các flow bên trong.

## Risk assessment (probability × impact = score)
| Risk ID | Category | Mô tả rủi ro | P | I | Score | Giảm thiểu |
|---|---|---|---|---|---|---|
| R-001 | SEC | Đăng nhập sai vẫn vào được trong | 2 | 3 | 6 | TC-004 |
| R-002 | BUS | Form/redirect login lỗi → chặn mọi user | 2 | 3 | 6 | TC-001, TC-002 |
| R-003 | TECH | Lỗi JS/asset khi load trang | 2 | 2 | 4 | TC-005 |

## Test cases
> `Tool`: PW = Playwright spec · MCP = test-runner lái chrome-devtools theo "Các bước".
> Title spec mã hoá `TC-NNN [Pn]` để chấm gate.

| TC | P | Tool | Mô tả | Các bước | Kỳ vọng | Status |
|------|----|------|--------------------------|------------------------------|-----------------------------------------------|--------|
| TC-001 | P0 | PW | Redirect trang chủ → login | 1. Mở / | Ở `/login`, title chứa "BrSE.ai", có heading "Sign in" | ⬜ |
| TC-002 | P0 | PW | Form login đủ thành phần | 1. Mở /login | Có ô Email, ô Password, nút "Sign in" | ⬜ |
| TC-003 | P1 | PW | Ô nhập giữ giá trị | 1. Gõ email; 2. Gõ password | Hai ô giữ đúng giá trị vừa nhập | ⬜ |
| TC-004 | P0 | PW | Đăng nhập sai bị chặn | 1. Nhập sai; 2. Bấm Sign in | Vẫn ở `/login` (không vào dashboard) | ⬜ |
| TC-005 | P1 | PW | Trang load không lỗi JS | 1. Mở /login | Không pageerror; HTTP < 400 | ⬜ |

## Độ phủ
- [x] Authentication — login surface (đầy đủ cần tài khoản)
- [ ] Authorization (truy cập URL cấm — cần tài khoản)
- [x] Form validation (negative)
- [ ] Business flow chính (cần tài khoản)
- [ ] Responsive · [ ] Performance (Lighthouse)
- [x] Health (console/network)

## Quality gate
P0 = 100% (else FAIL) · P1 ≥ 95% (else CONCERNS) · P2/P3 informational. Sinh tự động bằng `report.mjs`.
