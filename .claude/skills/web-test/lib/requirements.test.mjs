import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequirements, planRequirements } from './requirements.mjs';

const REQUIREMENTS = `# Phân tích requirement — app.test
> **Duyệt:** ⬜ Chờ duyệt

## Requirement
| REQ | Nhóm | Mô tả | Nguồn | Trạng thái | Xác nhận bởi |
|---|---|---|---|---|---|
| REQ-001 | Đăng nhập | Sai mật khẩu thì báo lỗi | PRD.pdf §3.1 | Đã xác nhận | PRD.pdf |
| REQ-002 | Chung | Không lỗi JS | Chuẩn chung | **đã xác nhận** | QA |
| REQ-003 | Đơn hàng | Tìm đơn theo mã | Suy luận | Chấp nhận tạm | — |
| REQ-004 | Đơn hàng | Phí ship < 500k | Suy luận | Cần hỏi | — |
| REQ-005 | Cũ | Xuất PDF | PRD.pdf §9 | Bỏ | PRD.pdf |
| REQ-006 | Lạ | Gì đó | Suy luận | chưa rõ | — |

## Câu hỏi cần làm rõ
| # | REQ | Câu hỏi | Hỏi ai | Trả lời |
|---|---|---|---|---|
| 1 | REQ-004 | Ngưỡng miễn phí ship? | PO | |
`;

test('parseRequirements reads id, description and status by header name', () => {
  assert.deepEqual(parseRequirements(REQUIREMENTS), [
    { id: 'REQ-001', description: 'Sai mật khẩu thì báo lỗi', status: 'confirmed' },
    { id: 'REQ-002', description: 'Không lỗi JS', status: 'confirmed' },
    { id: 'REQ-003', description: 'Tìm đơn theo mã', status: 'provisional' },
    { id: 'REQ-004', description: 'Phí ship < 500k', status: 'question' },
    { id: 'REQ-005', description: 'Xuất PDF', status: 'dropped' },
    { id: 'REQ-006', description: 'Gì đó', status: 'unknown' },
  ]);
});

test('parseRequirements finds the description and status columns wherever they are', () => {
  const md = `| Trạng thái | Mô tả | REQ |
|---|---|---|
| Cần hỏi | Phí ship | REQ-009 |`;
  // The REQ column must come first for a row to count: the first cell holds the id.
  assert.deepEqual(parseRequirements(md), []);
  const reordered = `| REQ | Trạng thái | Nguồn | Mô tả |
|---|---|---|---|
| REQ-009 | Cần hỏi | Suy luận | Phí ship |`;
  assert.deepEqual(parseRequirements(reordered), [{ id: 'REQ-009', description: 'Phí ship', status: 'question' }]);
});

test('parseRequirements reads Vietnamese written in NFD and CRLF files', () => {
  const md = REQUIREMENTS.normalize('NFD').replaceAll('\n', '\r\n');
  assert.deepEqual(parseRequirements(md).map((r) => r.status),
    ['confirmed', 'confirmed', 'provisional', 'question', 'dropped', 'unknown']);
});

test('parseRequirements returns nothing when there is no requirement table', () => {
  assert.deepEqual(parseRequirements('# Phân tích requirement\n\nChưa có gì.\n'), []);
});

test('planRequirements maps every TC row to the REQ ids it mentions, once each', () => {
  const plan = `| TC | REQ | P | Tool | Mô tả | Các bước | Kỳ vọng | Status |
|---|---|---|---|---|---|---|---|
| TC-001 | REQ-001, REQ-002 | P0 | PW | Login | 1. Mở /login | REQ-001 đạt | ⬜ |
| TC-002 | — | P2 | PW | Console | 1. Mở / | Không lỗi | ⬜ |
Ghi chú REQ-003 ngoài bảng không tính.`;
  assert.deepEqual([...planRequirements(plan)], [['TC-001', ['REQ-001', 'REQ-002']], ['TC-002', []]]);
});
