# THIRD-PARTY-NOTICES.md — ส่วนประกอบบุคคลที่สามของระบบประเมินความเสี่ยงทางเดินหายใจ

> อัปเดต: 2026-10-04 (Phase 3) · ตรวจไลเซนส์จากไฟล์ LICENSE ในแพ็กเกจจริง ไม่ใช่การเดา
> ไฟล์นี้ไม่มี API key, token หรือ secret ใด ๆ

## MIT License components

**vitallens 0.6.1** — Copyright (c) 2026 Rouast Labs (Philipp Rouast)
- ที่มา: pip package `vitallens`
- ใช้งาน: rPPG local POS mode สำหรับประมาณ HR จากวิดีโอใบหน้า

**vitallens-core 0.2.3** — Copyright (c) 2026 Rouast Labs
- ที่มา: pip package `vitallens-core` (ไบนารี .pyd)
- ใช้งาน: core signal processing ของ vitallens

**Ultra-Light-Fast-Generic-Face-Detector-1MB** — Copyright (c) 2019 linzai
- ที่มา: แพ็กมากับ vitallens (`vitallens/models/.../model_rfb_320.onnx`)
- ใช้งาน: ตรวจจับใบหน้าก่อนประมวลผล rPPG

**onnxruntime 1.30.0** — Copyright (c) Microsoft Corporation
- ที่มา: pip package `onnxruntime`
- ใช้งาน: runtime สำหรับ face detector ONNX

**prpy 0.4.4**
- ที่มา: pip dependency ของ vitallens
- ใช้งาน: video/signal utilities

ข้อความ MIT License (ใช้ร่วมกัน):
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

## Apache License 2.0 components

**MediaPipe Tasks Vision (vision_bundle.mjs + wasm)** — Google LLC
- ที่มา: vendored offline ที่ `frontend/public/mediapipe/` (ดาวน์โหลด 1 ต.ค. 2026)
- เวอร์ชัน: UNKNOWN (ไฟล์ไม่มี version string — ดู MODEL-PROVENANCE.md)
- ใช้งาน: Pose Landmarker runtime ฝั่ง browser

**Pose Landmarker model (pose_landmarker_lite.task)** — Google LLC
- ที่มา: vendored offline ร่วมกับชุดข้างต้น
- ไลเซนส์ upstream: Apache 2.0
- ใช้งาน: ตำแหน่งจุดไหล่/ลำตัวเพื่อประมาณอัตราการหายใจ

## GPL components (external binary — ไม่ถูก link เข้าโค้ดโปรเจกต์)

**ffmpeg 7.1.1 essentials build** — GyanD (Windows)
- ที่มา: github.com/GyanD/codexffmpeg release 7.1.1 — เก็บที่ `admin-app/server/bin/` (gitignored, ไม่ commit)
- ไลเซนส์ build: GPL v3 (build "essentials" รวม component GPL เช่น libx264)
- รูปแบบการใช้งาน: **เรียกผ่าน subprocess เป็นโปรแกรมแยก** (transcode วิดีโอ VFR → CFR) ไม่ได้ link หรือแจกจ่ายร่วมในผลิตภัณฑ์ — ตามแนวปฏิบัติ GPL-as-separate-process
- ทางเลือกหากต้องการหลีกเลี่ยง GPL ทั้งหมด: ใช้ ffmpeg build แบบ LGPL หรืออนุญาตให้ผู้ใช้ระบุ binary ผ่าน env `VITALSIGNS_FFMPEG_BIN`

## ข้อความเตือนที่ต้องแสดงคู่ระบบ

ผลลัพธ์ของ vitallens มาพร้อมข้อความจากผู้ผลิต:
"The provided values are estimates and should be interpreted according to the provided confidence scores. The VitalLens API is not a medical device and its estimates are not intended for any medical purposes."
