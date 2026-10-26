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
- `TRUST_PROXY=1` เปิดใช้ X-Forwarded-* เฉพาะ proxy บนเครื่องเดียวกัน หาก proxy อยู่เครื่องอื่นต้องตั้ง TRUST_PROXY_IPS เป็น IP ที่เชื่อถือด้วย (ค่าเริ่มต้นไม่เชื่อ header เหล่านี้)

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

## Security hardening (2026-10-26)
- Forwarded headers are ignored by default. For a local trusted reverse proxy set TRUST_PROXY=1. For a remote proxy also set TRUST_PROXY_IPS to its exact socket IP addresses (comma separated); restrict backend access with the firewall. The proxy must overwrite X-Forwarded-Proto/Host and append the actual client to X-Forwarded-For.
- Set the main URL to https://your-domain and configure HTTPS at your reverse proxy before publishing. All HTTP paths, including admin, redirect to the configured HTTPS origin. COOKIE_SECURE=1 explicitly enables Secure cookies.
- Existing admin sessions require a new login after this update. Password changes invalidate sessions bound to the old credentials and rotate the current session token.
- Limits reserve each password check before scrypt: 5 attempts per IP and 50 across the admin account per 15-minute window (successful attempts count too). This bounds concurrent/distributed work; an attacker may temporarily exhaust the shared budget. Put additional rate limits/MFA/access restrictions at the reverse proxy for production.
- Upload buffering: at most 4 request bodies per worker. Upload storage defaults to 1 GiB; UPLOAD_QUOTA_BYTES overrides it. Headers/signatures are validated; files are not fully decoded or malware scanned. Use an isolated media origin and scanning service if uploads become public-facing.
- JSON mutations use exclusive .lock files and refuse busy operations. If a worker is forcibly terminated during a write, stop ALL workers and remove only the corresponding stale data/*.json.lock or data/uploads-quota.lock before restarting. Do not remove an active lock. Use a local filesystem, not a OneDrive/network-synced directory, in production.
- Content saves require _revision; stale writes return HTTP 409. Keep unsaved text elsewhere, reload the latest content and merge changes.
- Run npm test. Tests use isolated synthetic content/credentials; RCM_TEST_TMP can select a writable scratch directory.
- Configure the web server document root to public/ only. Never expose data/, .git/, lib/, tests/ or source backups through nginx/Apache/IIS. Use a supported Node.js LTS, OS updates, restricted filesystem ACLs and backups.


## สถิติผู้เข้าชม (Visitor statistics)
- ดูได้ที่หลังบ้าน เมนู **รายงาน → สถิติผู้เข้าชม** (เฉพาะแอดมิน): วันนี้ / เมื่อวาน / 7 / 15 / 30 วัน หรือเลือกช่วงวันที่เองย้อนหลังได้
- เก็บทุกครั้งที่มีคนเปิดหน้าเว็บ (ไม่นับไฟล์รูป/CSS, หน้า 404, คำขอ HEAD, prefetch และบอท) ลงไฟล์รายวันที่ `data/visits/YYYY-MM-DD.jsonl` ตัดวันตามเวลาไทย (UTC+7)
- **เข้าชมจริง** = จำนวนหน้าที่คนเปิด · **ไม่ซ้ำ** = นับด้วยคุกกี้ไม่ระบุตัวตน `vid` (อายุ 1 ปี) · **Traffic** = ทั้งหมดรวมบอท
- ต้องตั้ง `TRUST_PROXY=1` บนโฮสต์ที่อยู่หลัง proxy (เช่น Plesk) ไม่เช่นนั้นจะเห็น IP เป็น 127.0.0.1 ทุกคน
- เก็บข้อมูล 400 วัน (ปรับด้วย `ANALYTICS_DAYS`, ขั้นต่ำ 30) แล้วลบไฟล์เก่าอัตโนมัติ · โฟลเดอร์ `data/visits/` ไม่ถูกส่งขึ้น GitHub
- IP และคุกกี้ถือเป็นข้อมูลส่วนบุคคลตาม PDPA ควรมีประกาศนโยบายความเป็นส่วนตัวบนเว็บไซต์

## โฮสต์หลัง proxy (Plesk / nginx) และการ redirect HTTPS
- แอปจะ redirect ไป `https://` ก็ต่อเมื่อ **แน่ใจว่าผู้เข้าชมเข้ามาด้วย http** เท่านั้น (proxy ที่เชื่อถือส่ง `X-Forwarded-Proto: http` หรือเป็นการเชื่อมต่อตรงจากภายนอกที่ไม่มี TLS) ถ้า proxy ไม่ส่งข้อมูลนี้ แอปจะไม่ redirect เพื่อไม่ให้เกิดลูป `ERR_TOO_MANY_REDIRECTS`
- เพื่อให้บังคับ HTTPS และอ่าน IP จริงได้ ให้ตั้ง `TRUST_PROXY=1` และให้ proxy ส่ง `X-Forwarded-Proto` (Plesk: Apache & nginx Settings → Additional nginx directives → `passenger_set_header X-Forwarded-Proto $scheme;`) และตั้ง `COOKIE_SECURE=1`
- การตรวจ Origin ของหลังบ้านเทียบ host เสมอ และเทียบ scheme เฉพาะเมื่อรู้แน่ จึงเข้าหลังบ้านผ่าน proxy ได้ปกติ
