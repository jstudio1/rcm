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

## Security round 2 (2026-10-27)
- **Two-step login (TOTP)**: หลังบ้าน → ตั้งค่า → บัญชี & ความปลอดภัย → "ยืนยันตัวตน 2 ขั้นตอน" ใช้ Google/Microsoft Authenticator หรือ Authy. เมื่อเปิด การล็อกอินต้องมีรหัส 6 หลักด้วย (รหัสเดียวใช้ซ้ำไม่ได้, รหัสผิดกับรหัสผ่านผิดตอบเหมือนกัน), การเปิด/ปิดทำให้ทุกเซสชันอื่นหลุด. ถ้าทำเครื่องมือถือหาย: หยุดเซิร์ฟเวอร์ แล้วลบฟิลด์ `totp` ออกจาก `data/admin.json`.
- A successful login gives its attempt back, so signing in repeatedly no longer counts toward the 5-per-IP lockout (wrong guesses still do).
- Admin sessions also end after 2 hours without activity (`SESSION_IDLE_MIN` to change), on top of the 8-hour limit.
- Per-address request cap: 900 requests/minute (`RATE_LIMIT_PER_MIN`), answered with 429. Traffic from a local proxy that forwards no client address is never limited.
- Request bodies: small ones (login, settings) have their own pool and a 10-second deadline, so slow-drip connections can't starve logins or uploads.
- Compressed copies of identical pages are cached (compression was the most expensive thing a request could trigger).
- Visit recording is capped at 600 views/hour per address (`ANALYTICS_MAX_PER_IP_HOUR`) and 60 MB per day file (`ANALYTICS_DAY_CAP_BYTES`) so a flood can't fill the disk.
- New headers: `X-Permitted-Cross-Domain-Policies: none`; admin responses add `Cross-Origin-Resource-Policy: same-origin`. `/.well-known/security.txt` is published when a report/contact email is set.


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

## นโยบายความเป็นส่วนตัว, ซัพพอร์ต และคุกกี้ (PDPA / App Store / Google Play)
ตั้งค่าทั้งหมดจากหลังบ้าน (ไม่ต้องแก้โค้ด):
- **สโตร์ & กฎหมาย → Privacy** (`/privacy`) แก้ข้อความได้ทั้งหมด ข้อความเริ่มต้นเป็นแบบร่างตามแนว PDPA **ต้องให้ผู้รู้กฎหมายตรวจ** และแก้ข้อ 11 (แอปเกม) ให้ตรงกับข้อมูลที่แอปเก็บจริง ก่อนนำ URL ไปกรอกใน App Store / Google Play ตารางคุกกี้ท้ายหน้าอัปเดตตามการตั้งค่าจริงอัตโนมัติ
- **สโตร์ & กฎหมาย → Support & ติดต่อ** (`/support`) ใส่ชื่อบริษัท อีเมล โทรศัพท์ LINE ที่อยู่ ข้อมูลนี้แสดงที่ท้ายทุกหน้า และแทนค่าตัวแปร `{{company}} {{email}} {{phone}} {{line}} {{address}} {{hours}} {{response}} {{site}} {{updated}} {{retention}}` ในข้อความนโยบาย
- **สโตร์ & กฎหมาย → คุกกี้** ข้อความและปุ่มของแบนเนอร์ทุกจุด เปิด/ปิดแบนเนอร์ เลขเวอร์ชันความยินยอม (เปลี่ยนเลข = ทุกคนต้องเลือกใหม่) และตัวเลือกให้นับสถิติแบบไม่ระบุตัวตนสำหรับคนที่ยังไม่ยินยอม

พฤติกรรมของระบบ:
- **ยอมรับทั้งหมด** → ตั้งคุกกี้ `vid` (สถิติ) เก็บ IP เต็ม และโหลด Google Analytics (ถ้าตั้ง) · **ปฏิเสธ/ยังไม่เลือก** → ไม่ตั้งคุกกี้สถิติ ตัดเลข IP ท่อนท้าย และลบ `vid` เดิมทันที (นับเป็นผู้เข้าชมแบบไม่ระบุตัวตน ไม่ซ้ำได้เฉพาะภายในวันเดียว)
- ผู้ใช้เปลี่ยนใจได้ทุกเมื่อจากลิงก์ "ตั้งค่าคุกกี้" ท้ายเว็บ การเลือกจำไว้ 6 เดือนในคุกกี้ `rc_consent`
- ไฟล์ `data/analytics.salt` (สร้างอัตโนมัติ ไม่ขึ้น Git) ใช้สร้างรหัสผู้เข้าชมแบบไม่ระบุตัวตนรายวัน

### หน้ากฎหมายสำหรับสโตร์ (ครบแล้ว: Privacy, Terms, Support)
- เมนูหลังบ้าน **สโตร์ & กฎหมาย → Privacy / Terms / Support & ติดต่อ** แก้ได้ทุกข้อความ แต่ละหน้ามีฉบับไทย (`/privacy`, `/terms`) และฉบับอังกฤษ (`/en/privacy`, `/en/terms`, เชื่อมกันด้วย hreflang เว้นเนื้อหาอังกฤษว่าง = ไม่มีหน้า)
- ข้อความเริ่มต้นเขียนตามรายการใน `STORE_WEB_REQUIREMENTS_TH.md` (ผู้ควบคุมข้อมูล, ข้อมูลที่เก็บรวมแชท/การซื้อ/ข้อมูลเทคนิค, ไม่มีโฆษณา, ลบถาวรภายใน N วัน, สิทธิ PDPA, ผู้เยาว์, ความปลอดภัย, วันที่มีผล) **ต้องให้ผู้รู้กฎหมายตรวจ** และเทียบกับสิ่งที่เกมเก็บจริง
- ตัวแปรในข้อความ: `{{app}} {{company}} {{email}} {{reportEmail}} {{phone}} {{line}} {{address}} {{hours}} {{response}} {{site}} {{updated}} {{retention}} {{minAge}} {{deleteDays}}` ค่ามาจาก "ซัพพอร์ต / ติดต่อเรา" และกล่อง "ค่าที่ใช้ในนโยบาย/ข้อตกลง" **บรรทัดที่มีตัวแปรที่ยังว่างจะไม่แสดงบนหน้าสาธารณะ** (ไม่มี `[ยังไม่ได้ตั้งค่า]` หรือข้อความร่างหลุดออกไป)
- หัวข้อรองใส่ id ได้: `## หัวข้อ {#report}` · หน้าซัพพอร์ตมีช่องทางรายงานผู้เล่น กฎชุมชน และ FAQ แก้ได้ในหลังบ้าน
- **สโตร์ & กฎหมาย → ความพร้อมส่งสโตร์** เช็กลิสต์ตามเอกสารข้อกำหนดของสโตร์ อัปเดตตามที่แก้ทันที
- หน้า Support และ FAQ มีฉบับอังกฤษ (`/en/support`, `/en/faq`) เช่นกัน (FAQ ใส่คำถาม/คำตอบอังกฤษต่อรายการ)
- **ลิงก์โยงกัน**: ทุกหน้ากฎหมายมีแถว "หน้าที่เกี่ยวข้อง" ท้ายหน้า + ลิงก์ท้ายเว็บ + sitemap ใช้ตัวแปร `{{deleteUrl}} {{oddsUrl}} {{termsUrl}} {{privacyUrl}} {{supportUrl}} {{faqUrl}}` ในข้อความได้
- **หน้าลบบัญชี (`/delete-account`) และหน้าอัตรากล่องสุ่ม (`/odds`)**: มีที่แก้ในหลังบ้าน (สโตร์ & กฎหมาย → ลบบัญชี / อัตรากล่องสุ่ม) ยังไม่มีเนื้อหาให้ ต้องเขียนเอง ลิงก์ทั้งหมดจะปรากฏเองเมื่อใส่หัวข้อ + เนื้อหา ถ้าว่างอยู่จะถูกซ่อนทุกที่
- **สโตร์ & กฎหมาย → URL สำหรับสโตร์**: รวม URL ที่ต้องกรอกในสโตร์พร้อมปุ่มคัดลอก และปุ่ม "ตรวจทุกลิงก์" (ต้องตั้ง URL เว็บเป็น https ก่อน; ตัวตรวจถูกกันไม่ให้เรียกที่อยู่ภายใน/ SSRF)

## ระบบสมาชิก (ล็อกอิน/สมัคร) — Mockup พร้อมต่อ API
- เปิดที่หลังบ้าน **ตั้งค่า → ระบบสมาชิก** (ปิดอยู่เป็นค่าเริ่มต้น = ไม่มีหน้าและไม่มีปุ่มบนเมนู) หน้า: `/login`, `/register`, `/forgot-password`, `/account` (ภาพรวม), `/account/profile`, `/security`, `/payment`, `/history`, `/coupon`, `/items`, `/redeem` ทุกหน้า noindex และไม่อยู่ใน sitemap
- โหมด **Mockup**: ข้อมูลสมมุติเก็บในเบราว์เซอร์ของผู้เข้าชมเอง ไม่ส่งอะไรออกไป ไม่เก็บรหัสผ่าน (มีแถบ MOCKUP แจ้งบนหน้า)
- โหมด **API จริง**: ใส่ที่อยู่ API (https เท่านั้น, http ได้เฉพาะ localhost) ระบบเพิ่มเฉพาะ origin นั้นใน CSP `connect-src` หน้าเว็บเรียกด้วย `credentials: 'include'` ให้ API เก็บล็อกอินเป็นคุกกี้ HttpOnly/Secure/SameSite และตั้ง CORS ให้โดเมนเว็บนี้ ไม่มีรหัสผ่าน/โทเคนเก็บใน localStorage
- เส้นทางที่เรียก (แก้ได้ในหลังบ้าน): `POST /auth/login {username,password}`, `POST /auth/register {username,email,password}`, `POST /auth/logout`, `POST /auth/forgot-password {email}`, `GET|PUT /me` (`{name,username,email,phone,cash,point}`), `POST /me/password {current,next}`, `GET /me/history` (`[{date,type,detail,amount}]`), `GET /me/coupons` (`[{code,title,expires,status}]`), `GET /me/items` (`[{name,qty,note}]`), `GET /me/payment-methods` (`[{type,label,note}]` ห้ามส่งเลขบัตรเต็ม), `POST /me/redeem {code}` → `{message,user?}` ตอบ 401 เมื่อยังไม่ล็อกอิน และ 4xx พร้อม `{message}` เมื่อผิดพลาด
- ไฟล์: `lib/portal.js` (หน้า), `public/account.js` (ตัวเชื่อม mock/API), `public/account.css`
- **ปุ่มหน้าแรก**: ที่ หน้าแรก → ปุ่มดาวน์โหลด & โซเชียล มีช่อง "แสดงปุ่มนี้" ของ Windows/App Store/Google Play/Facebook/TikTok/Discord/YouTube และปุ่มลงทะเบียน (ที่หน้าแรก) ปิด = ซ่อนปุ่ม

## ลงทะเบียนล่วงหน้า & รางวัล (Mockup พร้อมต่อระบบเกม)
- แสดงที่หน้า `/rewards` และใต้ส่วนหัวหน้าแรก (ปิดแยกกันได้) ประกอบด้วย: ตัวนับผู้ลงทะเบียนล่วงหน้า, แถบเป้าหมายพร้อมจุดสถานะ (ถึงแล้ว/ถัดไป/ยังไม่ถึง), การ์ดรางวัลต่อเป้าหมาย, รายละเอียดรางวัลที่เลือก และปุ่มลงทะเบียน (ใช้ข้อความ/ลิงก์/สวิตช์เดียวกับปุ่มลงทะเบียนหน้าแรก)
- ตั้งค่าที่หลังบ้าน **เนื้อหาเว็บ → ลงทะเบียนล่วงหน้า & รางวัล**: เปิด/ปิด, แสดงบนหน้าแรก, แหล่งตัวเลข, ข้อความทุกจุด และรายการรางวัล (เป้าหมายเป็นตัวเลข เช่น `5000` หรือป้าย `50K`/`1.5M`, ชื่อ, รายละเอียด, รูป) ระบบเรียงตามเป้าหมายและคำนวณสถานะให้เอง
- **Mockup:** ใช้ตัวเลขที่กรอกเอง · **API จริง:** ใส่ที่อยู่ https ของ endpoint ที่ตอบ `{"count": 13002}` (หรือ `{"total": …}`) หน้าเว็บถามทุก 60 วินาที ไม่ส่งคุกกี้ และเพิ่มเฉพาะ origin นั้นใน CSP `connect-src` ต้องตั้ง CORS ให้โดเมนเว็บนี้ ถ้า API ล่มจะแสดงตัวเลขสำรองที่กรอกไว้
- ไฟล์: `lib/prereg.js`, `public/prereg.js`, `public/prereg.css`
