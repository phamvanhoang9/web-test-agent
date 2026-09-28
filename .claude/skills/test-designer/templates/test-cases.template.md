# Test plan — <SITE>

> Generated from exploration of `<URL>` on <DATE>.
> Method: black-box, risk-based (BMAD testarch style). Status: ⬜ chưa chạy · ✅ pass · ❌ fail · ⏭️ skip

## Phạm vi & môi trường
- Target: `<URL>`
- Môi trường: <staging | production>  (test ghi/sửa dữ liệu → dùng staging)
- Tài khoản test: <có / không — không dán mật khẩu thật; dùng env TEST_EMAIL/TEST_PASSWORD>

## Route / chức năng không test (và lý do)
> Mọi route và mọi nút/ô nhập/link mà exploration tìm thấy phải có TC, hoặc nằm ở bảng này.
> `coverage.mjs` kiểm cả hai.

| Route / chức năng | Lý do không test | Cần gì để test |
|---|---|---|
| <vd: `/teams/config`> | <vd: chỉ chạy trong Microsoft Teams> | <vd: tenant M365 + app đã cài> |

## Risk assessment (probability × impact = score)
Score ≥6 ⇒ P0 · 3–4 ⇒ P1 · 1–2 ⇒ P2/P3. Category: SEC/PERF/DATA/BUS/TECH/OPS.

| Risk ID | Category | Mô tả rủi ro | P (1-3) | I (1-3) | Score | Giảm thiểu (test nào phủ) |
|---|---|---|---|---|---|---|
| R-001 | SEC | <vd: đăng nhập sai vẫn vào được> | 2 | 3 | 6 | TC-004 |
| R-002 | BUS | <vd: form không validate> | 2 | 2 | 4 | TC-003 |

## Priority → cadence (khi nào chạy)
- **P0** (critical, score ≥6, chặn luồng chính): chạy **mỗi commit** — gate phải 100%
- **P1** (high, score 3–4): chạy **mỗi PR** — gate ≥95%
- **P2** (medium): chạy **nightly** — informational
- **P3** (low/exploratory): **on-demand**

## Test cases
> Bảng này là "hợp đồng" để script-generator / test-runner đọc. **User sửa trực tiếp được.**
> - Cột **Tool**: `PW` = script-generator sinh Playwright spec · `MCP` = test-runner tự lái
>   chrome-devtools theo cột "Các bước" (dùng khi DOM động / Playwright khó).
> - Cột **P**: P0–P3 (lấy từ Risk ở trên). script-generator mã hoá vào tiêu đề test
>   `test('TC-001 [P0] ...')` để chấm gate.
> - **Các bước** nhiều bước: ngăn bằng `;` (vd `1. Mở /; 2. Bấm Sign in`).

| TC | P | Tool | Mô tả | Các bước | Kỳ vọng | Status |
|------|----|------|----------------|------------------|------------------------|--------|
| TC-001 | P0 | PW | <mô tả ngắn> | 1. <…>; 2. <…> | <kết quả kiểm chứng được> | ⬜ |
| TC-002 | P1 | PW | <…> | <…> | <…> | ⬜ |
| TC-010 | P1 | MCP | <case DOM động> | 1. <…> | <…> | ⬜ |

## Độ phủ (coverage checklist)
- [ ] Authentication (login đúng/sai/trống, logout, session)
- [ ] Authorization (truy cập URL cấm)
- [ ] Form validation (required, định dạng, biên)
- [ ] Business flow chính
- [ ] Negative & edge cases
- [ ] Responsive (mobile/tablet/desktop)
- [ ] Performance (Lighthouse / Core Web Vitals)
- [ ] a11y (keyboard, ARIA, contrast)
- [ ] Bảo mật bề mặt (lộ dữ liệu console/network, headers)

## Quality gate (ngưỡng quyết định)
- P0 pass rate **100%** (không ngoại lệ) · P1 **≥95%** · P2/P3 informational
- Không có lỗi bảo mật (SEC) mở · Không rủi ro score ≥6 chưa giảm thiểu
- Quyết định: **PASS** / **CONCERNS** / **FAIL** — sinh tự động bằng `report.mjs`
