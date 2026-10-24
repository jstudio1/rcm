# RAYCITY-M website + admin

หน้าเว็บสร้างจากเซิร์ฟเวอร์ (SEO-friendly) และแก้ไขได้ผ่านหลังบ้าน `/admin` เท่านั้น ไม่ต้องติดตั้งแพ็กเกจเพิ่ม (ต้องมี Node.js 18+)

## เริ่มใช้งาน
```
node server.js
```
- เว็บไซต์: http://localhost:3000/
- หลังบ้าน: http://localhost:3000/admin

ครั้งแรกระบบสร้างบัญชีแอดมินและพิมพ์รหัสผ่านออกหน้าจอ **ครั้งเดียว**
อยากกำหนดเอง ให้ตั้งก่อนรัน (PowerShell):
```
$env:ADMIN_USER="admin"; $env:ADMIN_PASSWORD="รหัสผ่านของคุณ"; node server.js
```
ลืมรหัสผ่าน: ลบ `data/admin.json` แล้วรันใหม่

## ตัวแปรเสริม
- `PORT` พอร์ต (ค่าเริ่มต้น 3000)
- `COOKIE_SECURE=1` เมื่อใช้ HTTPS (หรือใช้ proxy ที่ส่ง `X-Forwarded-Proto: https`)

## ไฟล์สำคัญ
- `data/content.json` เนื้อหาทั้งเว็บ (สำรองไฟล์นี้ + `public/uploads/`)
- `data/admin.json` บัญชีแอดมิน (รหัสผ่านเข้ารหัส scrypt)
- `public/` ไฟล์ CSS/JS/รูป, `lib/` โค้ดแสดงผล, `admin/` หน้าหลังบ้าน
- `legacy/` ไฟล์ HTML เดิมก่อนทำระบบ (เก็บไว้อ้างอิง ลบได้)

## SEO ที่มีให้
title / meta description / canonical / Open Graph / Twitter card ต่อหน้า, JSON-LD (Organization, WebSite, FAQPage, NewsArticle), `/sitemap.xml`, `/robots.txt` (ปิด `/admin`), หน้าข่าวแต่ละข่าวมี URL ของตัวเอง
