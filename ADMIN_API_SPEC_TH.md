# สเปก API หลังบ้านเกม (ให้ทีมเกม) — สำหรับเมนู "ระบบเกม"

เมนู **ระบบเกม** ในหลังบ้านเว็บ (แดชบอร์ด, บัญชีผู้เล่น, ประวัติ, รางวัล) ตอนนี้เป็น **Mockup**: หน้าจอเรียก `/admin/api/gameops/*` ของเซิร์ฟเวอร์เว็บ ซึ่งตอบด้วยข้อมูลตัวอย่างจาก `lib/gameops.js` และเก็บสิ่งที่แอดมินทำไว้ใน `data/gameops.json` (ไม่ขึ้น git, ไม่กระทบผู้เล่น/เงินจริง) เมื่อทีมเกมมี API จริง ให้แทนที่ฟังก์ชันใน `lib/gameops.js` ให้เรียก API ของเกมด้วยรูปแบบด้านล่าง หน้าจอ `admin/gameops.js` ไม่ต้องแก้

## หลักการ
- ผู้เรียกคือ **เซิร์ฟเวอร์เว็บ** ไม่ใช่เบราว์เซอร์ ใช้คีย์/โทเคนฝั่งเซิร์ฟเวอร์ (ตัวแปรสภาพแวดล้อม ไม่ใส่ใน repo) ผ่าน https เท่านั้น
- ทุกการแก้ข้อมูลต้องบันทึก **ชื่อแอดมินที่ทำ** (`by`) และเหตุผลใน audit log ของเกมด้วย
- เวลาใช้เขตเวลาไทย (UTC+7) รูปแบบ `YYYY-MM-DD HH:mm`
- ข้อผิดพลาดตอบ 4xx พร้อม `{ "error": "ข้อความภาษาไทยที่แสดงให้แอดมินอ่านได้" }`

## 1. แดชบอร์ด — `GET /dashboard`
ตอบ: `totals` { `accounts`, `suspended`, `online`, `signupsToday`, `signups7`, `signups30`, `topupToday` (บาท), `topupTodayCount`, `topup7`, `topup30`, `gift30` (แคชที่แอดมินเติมให้) } และ `series` { `days` [30 วัน เก่า→ใหม่ `YYYY-MM-DD`], `signups` [30], `topupBaht` [30], `topupCount` [30] } และ `latestSignups` [{username, character, joined}], `latestTopups` [{ts, username, method, price}]
- `online` = ผู้เล่นที่ออนไลน์ตอนนี้ (หน้าจอเรียกซ้ำทุก 30 วินาที จึงควรตอบเร็ว/แคชได้)
- ยอดเติมเงินนับเฉพาะรายการที่ชำระ **สำเร็จ** และไม่รวมแคชที่แอดมินเติมให้

## 1.1 ภาพรวมรายได้ — `GET /revenue?from=YYYY-MM-DD&to=YYYY-MM-DD`
ไม่ส่งวันที่ = วันนี้ จำกัดช่วงไม่เกิน 366 วัน `to` เกินวันนี้ให้ตัดเป็นวันนี้ ตอบ:
- `range` {from, to, days}, `prev` {from, to, partial} = ช่วงก่อนหน้าความยาวเท่ากัน (ถ้าช่วงนี้จบที่วันนี้ ให้นับช่วงก่อนหน้าถึงเวลาเดียวกันของวัน `partial: true` เพื่อไม่เทียบวันที่ยังไม่จบกับวันเต็ม)
- `totals` {`revenue` (บาท เฉพาะรายการที่ชำระสำเร็จ ไม่รวมแคชที่แอดมินเติมให้), `prevRevenue`, `delta` (% เทียบช่วงก่อน หรือ null ถ้าไม่มีข้อมูล), `count`, `players`, `average`, `closing` {created, paid, notPaid, rate} = อัตราปิดการขายของช่องทางที่ชำระผ่านหน้าชำระเงิน/QR (ใบที่สร้าง vs จ่ายแล้ว)}
- `channels` [{id, name, mode: "code"\|"checkout", enabled, revenue, count, players, share (% ของรายได้), attempts, failed, rate}] — **ต้องมีครบทุกช่องทางเติมเงินที่ตั้งไว้ในหน้าบ้าน** แม้ช่วงนั้นไม่มียอด (ชื่อ/รหัสช่องทางตรงกับ `topup.methods` ของเว็บ)
- `payers` {total, first, repeat, firstPct, repeatPct} — `first` = ผู้เล่นที่การเติมเงินสำเร็จ **ครั้งแรกในชีวิตบัญชี** อยู่ในช่วงนี้, `repeat` = เคยเติมสำเร็จมาก่อนช่วงนี้
- `prices` [{price, cash, count, players, baht, share, byChannel: {channelId: count}}] — ราคาตามแพ็กเกจเติมเงินของหน้าบ้าน
- `top` (10 อันดับเสมอ) [{rank, username, email, character, joined, status, lifetimeBaht, lifetimeCount, periodBaht, periodCount, last, channels}] — **จัดอันดับตามยอดเติมสะสมตลอดอายุบัญชี** (`lifetimeBaht` มากไปน้อย) ไม่ขึ้นกับช่วงเวลาที่เลือก `periodBaht/periodCount` คือที่เติมในช่วงที่เลือก (เป็น 0 ได้) และ `last`/`channels` นับทั้งหมดที่เคยเติม
- `series` {days, baht, count} รายวันตลอดช่วง

## 2. บัญชีผู้เล่น
| เมธอด | พาธ | ส่ง | ตอบ |
|---|---|---|---|
| GET | `/players?q=&status=&page=&limit=` | `status` = `active` / `suspended`; `q` ค้นชื่อผู้ใช้/อีเมล/ชื่อตัวละคร; `limit` ≤ 100 | `{items:[Player], total, page, pages, limit}` |
| POST | `/players/update` | `{id, email, character, note}` | `Player` (ชื่อผู้ใช้แก้ไม่ได้) |
| POST | `/players/suspend` | `{id, suspended: true/false, reason}` (ระงับต้องมีเหตุผล 3–200 ตัวอักษร) | `Player` |
| POST | `/players/topup` | `{id, cash (1–1,000,000), note}` เติมแคชให้โดยตรง ไม่ผ่านการชำระเงิน บัญชีที่ถูกระงับต้องปฏิเสธ | `Player` |

`Player` = `{id, username, email, character, joined, status: "active"|"suspended", reason, note, cash}`

## 3. ประวัติ (ทุกตัวรองรับ `q`, `page`, `limit` และตอบ `{items, total, page, pages, limit}`)
- `GET /history/topups?status=success|failed|pending&from=YYYY-MM-DD&to=YYYY-MM-DD` → item `{id, ts, day, username, method, price (บาท), cash, point, status, by}` (`by` ว่าง = ผู้เล่นจ่ายเอง, มีค่า = ชื่อแอดมินที่เติมให้) และ `summary` {count, baht, cash} ของ **ทั้งรายการที่กรอง** ไม่ใช่แค่หน้านี้
- `GET /history/coupons` → item `{ts, username, code, title, result}`
- `GET /history/codes` → item `{ts, username, code, batch, rewards}`

## 4. รางวัล
| เมธอด | พาธ | ส่ง | ตอบ |
|---|---|---|---|
| GET | `/coupons` | – | `{items:[Coupon]}` |
| POST | `/coupons/create` | `{code?, title, kind: "percent"\|"cash"\|"item", value, itemName?, limit (0=ไม่จำกัด), perUser, start?, end?}` | `Coupon` (ไม่ส่ง `code` = ให้สุ่ม) |
| POST | `/coupons/toggle` | `{code, active}` | `{code, active}` |
| POST | `/coupons/delete` | `{code}` | `{code}` |
| GET | `/codes` | – | `{items:[Batch]}` |
| POST | `/codes/create` | `{name, prefix (A-Z0-9 2–12), count (1–1000), maxUses, expires?, rewards:[{type:"cash"\|"point"\|"item", name?, qty}]}` | `Batch` + `codes:[...]` |
| GET | `/codes/batch?id=` | – | `{id, name, prefix, count, codes:[...]}` |

`Coupon` = `{code, title, kind, value, itemName, limit, perUser, start, end, used, active, state: "on"|"off"|"expired"|"soon"}`
`Batch` = `{id, name, prefix, count, rewards, maxUses, expires, created, by, used}`
- รูปแบบโค้ดรางวัล `PREFIX-XXXX-XXXX` ใช้ตัวอักษรไม่กำกวม (ไม่มี 0 O 1 I) และต้องไม่ซ้ำกันทั้งระบบ
- โค้ดที่สร้างแล้วเก็บ/ส่งออกได้เฉพาะตอนสร้างและจากหน้า "ดูโค้ด" ของชุดที่สร้างใหม่

## 5. ที่ต้องทำเมื่อต่อ API จริง
- ตัดข้อความ MOCKUP ออก (อยู่ใน `admin/gameops.js` ฟังก์ชัน `mockBar`)
- ย้ายสิทธิ์: ตอนนี้แอดมินทุกคนทำได้ทุกอย่าง ควรแยกสิทธิ์ (ดู/ระงับ/เติมเงิน/สร้างรางวัล) ตามบทบาทและกำหนดวงเงินเติมให้ต่อครั้ง/ต่อวัน
- audit log ฝั่งเกมต้องเก็บถาวร และการเติมแคชให้ผู้เล่นควรมีขั้นอนุมัติสำหรับยอดสูง
