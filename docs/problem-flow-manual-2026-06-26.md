# Problem Flow Manual (2026-06-26)

เอกสารนี้ใช้สำหรับเดโมสถานการณ์ "มีปัญหา" หลังบันทึกประชุม เพื่อให้เห็นการใช้งานระบบจากต้นทางถึงปลายทาง

## สิ่งที่เตรียมไว้ในระบบ

- อิงจาก meeting ล่าสุดของโปรเจค TEST-01
- เพิ่ม Action Items จำลอง 3 รายการ
  - 2 รายการเกินกำหนด
  - 1 รายการใกล้ครบกำหนด
- รัน reminder worker เพื่อให้เกิด digest และ trace จริง

## ขั้นตอนเดโมและภาพประกอบ

1. เปิดหน้า Reminders เพื่อดูภาพรวม
- ภาพ: docs/manual-screenshots/2026-06-26-problem-flow/step-01-reminders-overview.png

2. เปิดหน้า Reminders ของโปรเจค แล้วเห็น digest ที่มีปัญหา (Open/Overdue)
- ภาพ: docs/manual-screenshots/2026-06-26-problem-flow/step-02-reminders-list-problem-visible.png
- ภาพเสริม: docs/manual-screenshots/2026-06-26-problem-flow/step-08-reminders-project-final.png

3. เปิดหน้า Continuity ของโปรเจค เพื่อตรวจสถานะรวม
- ภาพ: docs/manual-screenshots/2026-06-26-problem-flow/step-04-continuity-summary-problem.png

4. ดูแท็บ ตามเจ้าของ เพื่อหาเจ้าของงานที่เกินกำหนด
- ภาพ: docs/manual-screenshots/2026-06-26-problem-flow/step-05-continuity-by-owner-fixed-thai.png

5. ดูแท็บ ตามโครงการ เพื่อดูรายการงานที่เกินกำหนดรายงาน
- ภาพ: docs/manual-screenshots/2026-06-26-problem-flow/step-06-continuity-by-project-fixed-thai.png

6. เปิดหน้า AI Trace เพื่อตรวจหลักฐานการประมวลผลเบื้องหลัง
- ภาพ: docs/manual-screenshots/2026-06-26-problem-flow/step-07-ai-trace-audit.png

## ผลที่ควรเห็นในเดโมนี้

- Continuity Summary: Open = 3, Due Soon = 1, Overdue = 2
- Continuity By Owner: เห็นผู้รับผิดชอบที่มีงานเกินกำหนด
- Continuity By Project: เห็นรายการงานเกินกำหนด 2 รายการ
- Reminders: มี digest ล่าสุดที่สะท้อนค่า Open/Due Soon/Overdue ตามข้อมูลจำลอง

## หมายเหตุที่พบระหว่างเดโม

- หน้าเลือก digest แล้วดู detail มี 404 ในคอนโซลบางครั้ง
- แม้มี 404 ดังกล่าว ข้อมูลระดับ list/summary และ continuity/trace ยังใช้งานเดโม flow ปัญหาได้

## Cleanup หลังเดโม (ถ้าต้องการ)

- ลบรายการ Action Item ที่ขึ้นต้นด้วย [SIM]
- รัน reminder ใหม่เพื่อล้างผลกระทบใน digest รอบถัดไป
