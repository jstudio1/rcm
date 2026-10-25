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
- `TRUST_PROXY=1` เชื่อ header `X-Forwarded-*` จาก proxy ที่ไม่ได้อยู่บนเครื่องเดียวกัน (ปกติไม่ต้องตั้ง: proxy บนเครื่องเดียวกัน เช่น Plesk nginx ใช้ได้เลย)

## ไฟล์สำคัญ
- `data/content.json` เนื้อหาทั้งเว็บ (สำรองไฟล์นี้ + `public/uploads/`)
- `data/admin.json` บัญชีแอดมิน (รหัสผ่านเข้ารหัส scrypt)
- `data/sessions.json`, `data/limits.json` สถานะการล็อกอิน/การล็อกเมื่อเดารหัสผิด (สร้างเอง ไม่ต้องสำรอง)
- `data/history/` สำเนาเนื้อหา 40 ครั้งล่าสุด (ย้อนได้จากหลังบ้าน)
- `public/` ไฟล์ CSS/JS/รูป/ฟอนต์, `lib/` โค้ดแสดงผล, `admin/` หน้าหลังบ้าน
- `legacy/` ไฟล์ HTML เดิมก่อนทำระบบ (เก็บไว้อ้างอิง ลบได้)

## รูปภาพและความเร็ว
- รูปใน `public/img/` ที่มีไฟล์ `.webp` ชื่อเดียวกันวางคู่ (เช่น `track.jpg` + `track.webp`) เบราว์เซอร์ที่รองรับจะได้ไฟล์ WebP ที่เล็กกว่าโดยอัตโนมัติ
- **ถ้าเปลี่ยนรูปใน `public/img/`** ให้ทำไฟล์ `.webp` ใหม่คู่กันด้วย ถ้าไม่ทำ ระบบจะเห็นว่า `.webp` เก่ากว่าแล้วส่งไฟล์ jpg/png ตัวใหม่แทน (ไม่แสดงรูปเก่า) แค่จะไม่ได้ความเร็วจาก WebP
- รูปที่อัปโหลดจากหลังบ้านใช้ได้ทันที (ไม่มี WebP อัตโนมัติ) แนะนำอัปโหลดเป็น `.webp` หรือ `.jpg` ที่ย่อขนาดแล้ว
- CSS/JS มีเลขเวอร์ชันใน URL เบราว์เซอร์แคชได้ 1 ปี แก้ไฟล์แล้วเลขเปลี่ยนเอง ส่วนรูปใน `/img` แคช 7 วัน
- ฟอนต์อยู่ใน `public/fonts/` (Barlow, Barlow Condensed, Kanit, ใบอนุญาต SIL OFL) ไม่โหลดจาก Google

## SEO ที่มีให้
- title / meta description / canonical / Open Graph (+ ขนาดรูป, locale th_TH) / Twitter card ต่อหน้า
- JSON-LD: Organization, WebSite, VideoGame (หน้าแรก), BreadcrumbList, FAQPage, NewsArticle (มีวันที่แก้ไขอัตโนมัติ)
- `/sitemap.xml` (มีวันที่อัปเดต + รูปภาพ, ไม่รวมหน้าที่ตั้ง noindex), `/robots.txt` (ปิด `/admin`)
- redirect อัตโนมัติ: `/หน้า/` → `/หน้า`, `/index.html` → `/`, www → โดเมนหลัก, http → https (เมื่อตั้ง "โดเมนหลัก" ในหลังบ้าน)
- หลังบ้าน > ข้อมูลเว็บ & SEO หลัก > เครื่องมือ SEO & สถิติ: รหัสยืนยัน Google Search Console / Bing, Google Analytics 4, บัญชี X
- หลังบ้าน > หน้าแต่ละหน้า: รูปแชร์เฉพาะหน้า และปุ่ม "ซ่อนจาก Google (noindex)"
- ข่าวและ Drivers มีช่อง alt ของรูป

## PageSpeed (หลังบ้าน > PageSpeed)
- ตรวจความเร็ว/คะแนนของเว็บจริงด้วย Google PageSpeed Insights ได้ทั้งมือถือและคอม เลือกหน้าได้ เก็บประวัติพร้อมกราฟ และตั้งให้ตรวจอัตโนมัติวันละครั้ง (หน้าแรก มือถือ + คอม)
- **ต้องใส่ Google API key (ฟรี)** ที่ "การตั้งค่า" ในหน้านั้น: console.cloud.google.com > APIs & Services > Library > "PageSpeed Insights API" > Enable > Credentials > Create credentials > API key
- ต้องตั้ง "โดเมนหลัก" ก่อน เพราะ Google ตรวจได้เฉพาะเว็บที่ออนไลน์ (ตรวจ localhost ไม่ได้)
- ข้อมูลและ key เก็บใน `data/pagespeed.json` (ไม่อยู่ใน git, key ไม่ถูกส่งไปที่หน้าเว็บ)
