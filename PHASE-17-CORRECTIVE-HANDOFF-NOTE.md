# PHASE-17-CORRECTIVE-HANDOFF-NOTE.md — บันทึกขอบเขตของ Commit 7236ddd (Corrective Handoff)

> 2026-10-05 · อ่านคู่กับ PHASE-17-COMMIT-INCIDENT-AUDIT.md

**This corrective note documents scope provenance only; it does not rewrite history or change validation results.**

## ข้อเท็จจริงของ Commit 7236ddd

1. **7236ddd มี Respiratory files ครบตาม Audit** — 37/37 ไฟล์ (ทั้ง source code และเอกสาร Phase 9-15) ตรวจด้วย `git diff 7236ddd^ 7236ddd --name-only` เทียบ RESPIRATORY-STAGING-LIST.txt
2. **Commit เดิมมี Mixed Scope** — ข้อความ commit ระบุเฉพาะงาน OpenAQ/Vertex (HGB vs Ridge) แต่เนื้อหาจริงรวม Respiratory submission package 37 ไฟล์ + OpenAQ/Vertex 2 ไฟล์
3. **ไม่ Amend / Rebase / Force Push** — ประวัติของ actor อื่นไม่ถูกแก้ ทุกกรณี (รับข้อจำกัดข้อความ mixed scope ไว้)
4. **Submission ต้องอ้างอิง Manifest ไม่อ้างว่า 7236ddd เป็น Respiratory-only** — เวลาอ้างอิงไฟล์/เนื้อหา ให้ใช้ RESPIRATORY-STAGING-LIST.txt + SUBMISSION-ARCHIVE-MANIFEST.md เป็นดัชนีขอบเขต ไม่ใช่ข้อความ commit
5. **OpenAQ/Vertex ไม่อยู่ใน Submission Scope** — ไฟล์ OpenAQ/Vertex 2 ไฟล์ที่อยู่ใน 7236ddd (`data/vertex/hgb_vs_ridge_results.json`, `notebooks/hgb_vs_ridge.py`) เป็นงานของ actor อื่นที่ติดมาพร้อม commit ไม่ใช่ส่วนของ respiratory submission
6. **Dataset จริงอยู่นอก Git** — BIDMC อยู่ที่ `C:\Users\ACER\research-data\bidmc\` (manifest.json + SHA-256) ไม่มี dataset content เข้า commit
7. **Push/Tag/Release ยังไม่ทำ** — commits อยู่บน local main เท่านั้น
8. **Professional Review ยังจำเป็น** — ผล BIDMC Track A (MAE 9.03 / Bias +8.92 / Abstention 42.4%) ต้องผ่านผู้เชี่ยวชาญก่อนอ้างอิงเชิงคลินิกใด ๆ

## แนวปฏิบัติสำหรับ session ถัดไป

- เวลาอ้างอิง submission package ให้ระบุ: "ไฟล์ respiratory 37 ไฟล์ใน commit 7236ddd (mixed-scope commit — ขอบเขตตาม RESPIRATORY-STAGING-LIST.txt)"
- ห้ามรวม metrics ของ OpenAQ/Vertex เข้ากับ respiratory validation ใด ๆ
- การเปลี่ยนแปลงเชิง algorithm ในอนาคต ทำใน research branch พร้อม protocol/approval แยก
