# สเปก API สำหรับระบบสมาชิกและเติมเงิน (ให้ทีมเกม)

หน้า `/login` `/register` `/account/*` ของเว็บไซต์เป็น Mockup ที่พร้อมต่อ API เมื่อเลือกโหมด **API จริง** ที่ ตั้งค่า › Login & Register › API เว็บจะเรียก API ตามที่ระบุด้านล่างโดยตรงจากเบราว์เซอร์ของผู้เล่น **เว็บเซิร์ฟเวอร์นี้ไม่เก็บและไม่ส่งต่อรหัสผ่าน รหัสบัตร หรือข้อมูลการชำระเงิน**

## 1. หลักการทั่วไป

| ข้อ | รายละเอียด |
|---|---|
| ที่อยู่ | ตั้งที่ `apiBase` เป็น `https://…` เท่านั้น (http ใช้ได้เฉพาะ localhost) เส้นทางต่อท้ายตั้งได้ในหลังบ้าน (ค่าเริ่มต้นด้านล่าง) |
| รูปแบบ | ส่งและรับ JSON (`Content-Type: application/json`) |
| การล็อกอิน | คุกกี้เซสชันของ API เอง: `HttpOnly; Secure; SameSite=Lax` (หรือ `None` ถ้าคนละโดเมน) เว็บเรียกด้วย `credentials: include` |
| CORS | `Access-Control-Allow-Origin: https://โดเมนเว็บ` (ห้ามใช้ `*`), `Access-Control-Allow-Credentials: true`, อนุญาต `Content-Type` และเมธอด GET/POST/PUT |
| CSRF | ใช้ `SameSite` ร่วมกับตรวจ `Origin` ของคำขอที่แก้ข้อมูลทุกครั้ง |
| ข้อผิดพลาด | ตอบ 4xx/5xx พร้อม `{ "message": "ข้อความภาษาไทยที่แสดงให้ผู้เล่นอ่านได้" }` ตอบ **401** เมื่อยังไม่ล็อกอิน เว็บจะพาไปหน้า /login |
| ความปลอดภัย | จำกัดจำนวนครั้งที่ล็อกอิน/ลองรหัสบัตรต่อ IP และต่อบัญชีที่ฝั่ง API, เก็บรหัสผ่านด้วย hash (argon2/bcrypt), ไม่ใส่ข้อมูลส่วนตัวใน URL |

## 2. ผู้ใช้ (object `user`)

```json
{
  "uid": "RC417546", "username": "hadedboy", "name": "Hadedboy", "email": "a@b.com", "phone": "",
  "level": 46, "club": "KGZZ", "joined": "2026-03-25",
  "cash": 900, "rain": 10780548, "point": 608, "pointExpire": "2026-11-30"
}
```

`uid` แสดงบนการ์ดสมาชิก (ปุ่มคัดลอก/QR), `joined` เป็นวันที่ `YYYY-MM-DD` ใช้คำนวณ "เป็นสมาชิกมาแล้ว", `pointExpire` เว้นว่างได้

## 3. เส้นทางบัญชี

| เมธอด | เส้นทางเริ่มต้น | ส่ง | ตอบ |
|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{user}` + ตั้งคุกกี้ |
| POST | `/auth/register` | `{username, email, password}` | `{user}` (ล็อกอินให้เลย) |
| POST | `/auth/logout` | – | `{ok:true}` |
| POST | `/auth/forgot-password` | `{email}` | `{ok:true}` (ตอบเหมือนกันไม่ว่ามีอีเมลนี้หรือไม่) |
| GET | `/me` | – | `user` (หรือ `{user}`) |
| PUT | `/me` | `{name, email, phone}` | `user` |
| POST | `/me/password` | `{current, next}` | `{ok:true}` |
| GET | `/me/history` | – | `[{date, type, detail, amount}]` |
| GET | `/me/coupons` | – | `[{code, title, expires, status}]` (`status` = `ใช้ได้` หรืออื่นๆ) |
| GET | `/me/items` | – | `[{name, qty, note}]` |
| POST | `/me/redeem` | `{code}` | `{message, user?}` รหัสผิดตอบ 4xx พร้อม `{message}` |

## 4. เส้นทางเติมเงิน

| เมธอด | เส้นทางเริ่มต้น | ส่ง | ตอบ |
|---|---|---|---|
| GET | `/topup/methods` | – | `{ "methods": [Method] }` |
| POST | `/topup/redeem` | `{method, code}` | `{message, user}` (ยอดใหม่) |
| POST | `/topup/checkout` | `{method, methodName, price}` | `{url}` ที่อยู่ `https://…` ของหน้าชำระเงิน เว็บจะพาผู้เล่นไปที่ url นั้น (รับเฉพาะ https) |

`Method`:

```json
{
  "id": "truemoney-cashcard", "name": "TrueMoney CashCard", "title": "Truemoney CashCard (บัตรเงินสดทรูมันนี่)",
  "logo": "https://cdn.example.com/tm.png", "mode": "code",
  "codeLabel": "กรอกรหัสบัตร", "codePh": "กรอกรหัส…", "note": "",
  "packages": [ { "price": "50", "cash": "5000", "point": "38" } ]
}
```

- `mode`: `code` = ผู้เล่นกรอกรหัสบัตรแล้วกด "ใช้งาน" (เรียก `/topup/redeem`), `checkout` = เลือกแพ็กเกจแล้วกด "ชำระเงิน" (เรียก `/topup/checkout`)
- `logo` รับเฉพาะ `https://` หรือพาธบนเว็บนี้ (`/…`) ไม่ใส่ = ไอคอนทั่วไป
- ในโหมด API ช่องทางและราคามาจาก API นี้ (ตาราง/ช่องทางที่ตั้งในหลังบ้านใช้เฉพาะโหมด Mockup)

### ข้อกำหนดฝั่งเซิร์ฟเวอร์เกม (สำคัญ)

1. **ตรวจรหัสบัตรและเครดิตยอดที่เซิร์ฟเวอร์เกมเท่านั้น** เว็บไม่ตรวจและไม่เชื่อค่า `price/cash/point` ที่ส่งมาจากเบราว์เซอร์ ให้คำนวณจากตารางราคาฝั่งเซิร์ฟเวอร์เอง
2. ทำให้ `/topup/redeem` ใช้ซ้ำไม่ได้ (idempotent ต่อรหัสบัตร) และจำกัดการลองผิดต่อบัญชี/IP
3. `/topup/checkout` ควรสร้างรายการชำระเงินที่ฝั่งเซิร์ฟเวอร์ แล้วคืน url ของผู้ให้บริการ ยืนยันผลผ่าน webhook ฝั่งเซิร์ฟเวอร์ ไม่ใช่จากหน้าเว็บ
4. ไม่ส่งเลขบัตรเครดิต/เลขบัญชีกลับมาในคำตอบใดๆ

## 5. เปรียบเทียบกับ Mockup

โหมด Mockup ใช้ข้อมูลสมมุติในเบราว์เซอร์ของผู้เข้าชม (localStorage) ไม่ส่งอะไรออกนอกเครื่อง: ล็อกอินด้วยชื่ออะไรก็ได้, เติมเงินด้วยรหัส `DEMO-<ราคา>` เช่น `DEMO-150`
