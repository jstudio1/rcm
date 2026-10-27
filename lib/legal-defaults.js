// Starting texts for the privacy policy, terms of service, support page and cookie banner (Thai + English).
// Everything here is editable in the admin. These are TEMPLATES following the store requirements
// (STORE_WEB_REQUIREMENTS_TH.md) and Thailand's PDPA: have them reviewed against what the game really does.
//
// {{tokens}} are filled when a page is shown, from the admin (Support / contact, and the legal settings):
//   {{app}} {{company}} {{email}} {{reportEmail}} {{phone}} {{line}} {{address}} {{hours}} {{response}}
//   {{site}} {{updated}} {{retention}} {{minAge}} {{deleteDays}}
// A line whose token is still empty is left out of the public page (it never shows "[not set]" or draft notes).

const privacyBody = `## 1. ผู้ควบคุมข้อมูลส่วนบุคคล
นโยบายนี้ใช้กับเกม {{app}} และเว็บไซต์ {{site}} อธิบายว่าเราเก็บ ใช้ และคุ้มครองข้อมูลส่วนบุคคลของท่านอย่างไร ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)

ผู้ควบคุมข้อมูลส่วนบุคคลคือ {{company}} ("เรา")
ที่อยู่: {{address}}
อีเมลติดต่อเรื่องข้อมูลส่วนบุคคล: {{email}}

## 2. ข้อมูลที่เราเก็บ
**ข้อมูลบัญชีผู้เล่น**
- ชื่อผู้ใช้ รหัสผ่าน (เก็บแบบเข้ารหัส เราไม่สามารถอ่านรหัสผ่านจริงของท่านได้)
- อีเมล (ถ้าท่านให้ไว้ตอนสมัคร) และวันที่สมัคร

**ข้อมูลในเกม**
- ตัวละคร รถ ไอเทม เงินในเกม ประวัติภารกิจ เพื่อน กิลด์ และปาร์ตี้

**ข้อความแชท**
- เราเก็บข้อความแชทในเกมไว้เพื่อตรวจสอบการใช้คำไม่เหมาะสมและการโกง

**ข้อมูลการซื้อ**
- รายการสั่งซื้อและสถานะ เมื่อมีการเติมเงินหรือซื้อไอเทม การชำระเงินทำผ่าน Apple หรือ Google เราไม่ได้รับหมายเลขบัตรของท่าน

**ข้อมูลทางเทคนิค**
- หมายเลข IP รุ่นเครื่อง เวอร์ชันแอป และบันทึกการเชื่อมต่อ (log)

**ข้อมูลจากการเข้าชมเว็บไซต์**
- หากท่านกด "ยอมรับทั้งหมด" ในแบนเนอร์คุกกี้ เราจะเก็บหมายเลข IP ประเภทอุปกรณ์ ระบบปฏิบัติการ เบราว์เซอร์ หน้าที่เปิด เว็บที่พาท่านมา (เฉพาะชื่อเว็บ) และเวลา พร้อมคุกกี้ไม่ระบุตัวตนเพื่อนับผู้เข้าชมไม่ซ้ำ
- หากท่านปฏิเสธหรือยังไม่เลือก เราจะไม่ตั้งคุกกี้สถิติ และนับการเข้าชมแบบไม่ระบุตัวตนเท่านั้น (ตัดหมายเลข IP ท่อนท้ายออก และไม่เชื่อมโยงข้ามวัน)

**ข้อมูลที่ท่านส่งให้เรา** เช่น อีเมลและรายละเอียดที่ท่านเขียนเมื่อติดต่อฝ่ายซัพพอร์ตหรือรายงานผู้เล่น

## 3. เราใช้ข้อมูลเพื่ออะไร
- ให้บริการเกม และให้บัญชีของท่านใช้งานได้ (ปฏิบัติตามสัญญา)
- ป้องกันการโกง การใช้โปรแกรมช่วย และบอท (ประโยชน์โดยชอบด้วยกฎหมาย)
- ตอบคำถามและให้ความช่วยเหลือ (ซัพพอร์ต)
- รักษาความปลอดภัยของระบบ และตรวจสอบการใช้คำไม่เหมาะสมในแชท
- วัดและปรับปรุงเว็บไซต์ (สถิติ) ตามความยินยอมของท่าน ท่านถอนได้ทุกเมื่อ
- ปฏิบัติตามกฎหมายและคำสั่งของหน่วยงานรัฐที่มีอำนาจ

## 4. เราแบ่งปันข้อมูลกับใคร
- ผู้ให้บริการเซิร์ฟเวอร์ที่ช่วยเราดำเนินงาน ภายใต้ข้อตกลงที่คุ้มครองข้อมูล
- Apple และ Google สำหรับการชำระเงินและการแจกจ่ายแอป
- หน่วยงานรัฐ เมื่อกฎหมายกำหนดเท่านั้น

เกมและเว็บไซต์ไม่มีโฆษณา เราไม่ขายข้อมูลส่วนบุคคลของท่าน และไม่ใช้บริการโฆษณาหรือติดตามของบุคคลที่สาม เว็บไซต์จะใช้เครื่องมือวิเคราะห์ของบุคคลที่สามก็ต่อเมื่อปรากฏในตารางคุกกี้ด้านล่างและท่านยินยอมแล้วเท่านั้น

## 5. เราเก็บข้อมูลนานแค่ไหน และการลบข้อมูล
- ข้อมูลบัญชีและข้อมูลในเกม เก็บตลอดเวลาที่บัญชีของท่านยังใช้งานอยู่
- เมื่อท่านขอลบบัญชี เราจะลบข้อมูลของท่านอย่างถาวรภายใน {{deleteDays}} วัน หลังจากยืนยันคำขอ
- ส่งคำขอลบบัญชีได้ที่ {{email}}
- หรือขอผ่านหน้า [ลบบัญชีและข้อมูล]({{deleteUrl}})
- ข้อมูลบางอย่างอาจถูกเก็บต่อเท่าที่จำเป็นเพื่อปฏิบัติตามกฎหมาย (เช่น หลักฐานการซื้อ) หรือป้องกันการโกง (เช่น บันทึกการระงับบัญชี) และจะถูกลบเมื่อพ้นระยะเวลาที่กฎหมายกำหนด
- ข้อมูลสถิติการเข้าชมเว็บไซต์เก็บไม่เกิน {{retention}} วัน แล้วลบอัตโนมัติ

## 6. สิทธิของท่านตาม PDPA
ท่านมีสิทธิขอเข้าถึงและขอสำเนาข้อมูล ขอแก้ไขให้ถูกต้อง ขอลบหรือทำลาย ขอระงับการใช้ ขอคัดค้านการประมวลผล ขอให้โอนย้ายข้อมูล และถอนความยินยอมที่เคยให้ไว้ ได้ทุกเมื่อ

ใช้สิทธิได้โดยติดต่อ {{email}} เราจะตอบภายใน 30 วัน

ท่านมีสิทธิร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)

## 7. ผู้เยาว์
เกมนี้สำหรับผู้เล่นอายุ {{minAge}} ปีขึ้นไป เราไม่ตั้งใจเก็บข้อมูลของเด็กที่อายุต่ำกว่านี้

หากท่านเป็นผู้ปกครองและพบว่าบุตรหลานสร้างบัญชีโดยไม่ได้รับอนุญาต โปรดติดต่อ {{email}} เพื่อให้เราลบข้อมูลนั้น

## 8. ความปลอดภัย
เราเก็บรหัสผ่านแบบเข้ารหัส ใช้ HTTPS ในการเชื่อมต่อ และจำกัดผู้ที่เข้าถึงข้อมูลเท่าที่จำเป็น

## 9. การส่งข้อมูลไปต่างประเทศ
ผู้ให้บริการบางรายอาจประมวลผลข้อมูลนอกประเทศไทย เราจะดูแลให้มีมาตรการคุ้มครองที่เหมาะสมตามที่ PDPA กำหนด

## 10. วันที่มีผลและการเปลี่ยนแปลงนโยบาย
นโยบายนี้มีผลตั้งแต่วันที่ {{updated}} เมื่อมีการเปลี่ยนแปลงสำคัญ เราจะแก้วันที่ "อัปเดตล่าสุด" บนหน้านี้ และแจ้งให้ท่านทราบในเกมหรือผ่านเว็บไซต์ และอาจขอความยินยอมใหม่

## 11. ติดต่อเรา
{{company}}
อีเมล: {{email}}
โทรศัพท์: {{phone}}
ที่อยู่: {{address}}`;

const privacyBodyEn = `## 1. Data controller
This policy covers the game {{app}} and the website {{site}}. It explains how we collect, use and protect your personal data under Thailand's Personal Data Protection Act B.E. 2562 (PDPA).

The data controller is {{company}} ("we").
Address: {{address}}
Contact for privacy matters: {{email}}

## 2. Data we collect
**Player account**
- Username and password (stored encrypted; we cannot read your actual password)
- Email address (if you give one at sign-up) and the sign-up date

**Game data**
- Characters, cars, items, in-game currency, mission history, friends, guilds and parties

**Chat messages**
- We keep in-game chat messages to review inappropriate language and cheating.

**Purchase data**
- Order records and status when you top up or buy items. Payments are handled by Apple or Google; we never receive your card number.

**Technical data**
- IP address, device model, app version and connection logs

**Website visits**
- If you choose "Accept all" in the cookie banner, we record your IP address, device type, operating system, browser, pages opened, referring site (site name only) and time, together with an anonymous cookie that counts unique visitors.
- If you decline or have not chosen, we set no analytics cookie and count your visit anonymously only (the last part of the IP address is removed and the visit is not linked across days).

**Information you send us**, such as your email and what you write when you contact support or report a player.

## 3. Why we use your data
- To run the game and keep your account working (performance of the contract)
- To prevent cheating, cheat software and bots (legitimate interest)
- To answer questions and provide support
- To keep our systems secure and review inappropriate chat
- To measure and improve the website (statistics), with your consent, which you can withdraw at any time
- To comply with the law and orders of competent authorities

## 4. Who we share data with
- Server hosting providers that help us operate the service, under data protection terms
- Apple and Google, for payments and app distribution
- Government authorities, only when required by law

The game and website contain no advertising. We do not sell your personal data and we do not use third-party advertising or tracking services. The website uses a third-party analytics tool only if it appears in the cookie table below and you have consented.

## 5. How long we keep data, and deletion
- Account and game data are kept while your account is active.
- When you request deletion of your account, we permanently delete your data within {{deleteDays}} days after the request is confirmed.
- Send account deletion requests to {{email}}.
- Or use the [account deletion page]({{deleteUrl}}).
- Some data may be kept longer only as far as needed to comply with the law (for example purchase records) or to prevent cheating (for example records of an account suspension), and is deleted once the legal period ends.
- Website statistics are kept for no more than {{retention}} days and then deleted automatically.

## 6. Your rights under the PDPA
You may ask to access and obtain a copy of your data, correct it, delete or destroy it, restrict its use, object to its processing, have it transferred, and withdraw consent you gave, at any time.

To exercise these rights, contact {{email}}. We will reply within 30 days.

You also have the right to complain to Thailand's Personal Data Protection Committee.

## 7. Children
This game is for players aged {{minAge}} and over. We do not knowingly collect data from younger children.

If you are a parent and believe your child created an account without permission, please contact {{email}} and we will delete that data.

## 8. Security
We store passwords in encrypted form, use HTTPS for connections, and limit access to data to those who need it.

## 9. International transfers
Some providers may process data outside Thailand. We make sure appropriate safeguards are in place as required by the PDPA.

## 10. Effective date and changes
This policy is effective from {{updated}}. When we make significant changes, we update the "Last updated" date on this page, tell you in the game or on the website, and may ask for your consent again.

## 11. Contact us
{{company}}
Email: {{email}}
Phone: {{phone}}
Address: {{address}}`;

const termsBody = `## 1. การยอมรับข้อตกลง
ข้อตกลงนี้ใช้กับการใช้เกม {{app}} และเว็บไซต์ {{site}} เมื่อท่านสร้างบัญชี ติดตั้ง หรือใช้งานเกม ถือว่าท่านยอมรับข้อตกลงนี้และนโยบายความเป็นส่วนตัว หากไม่ยอมรับ กรุณาอย่าใช้บริการ

ข้อตกลงนี้เป็นข้อตกลงระหว่างท่านกับ {{company}} ("เรา")

## 2. บัญชีผู้เล่น
- ผู้เล่นต้องมีอายุ {{minAge}} ปีขึ้นไป
- ท่านต้องให้ข้อมูลที่ถูกต้อง และรับผิดชอบกิจกรรมทั้งหมดที่เกิดขึ้นในบัญชีของท่าน
- เก็บรักษาชื่อผู้ใช้และรหัสผ่านเป็นความลับ ห้ามให้ผู้อื่นใช้บัญชีแทนท่าน
- หากสงสัยว่าบัญชีถูกใช้โดยไม่ได้รับอนุญาต แจ้งเราทันทีที่ {{email}}

## 3. เงินและไอเทมในเกม
- เงินในเกม (เช่น Rain, Cash, RP) และไอเทมทั้งหมดไม่มีมูลค่าเป็นเงินจริง และแลกคืนเป็นเงินไม่ได้
- ท่านได้รับสิทธิ์ใช้งานเงินและไอเทมในเกมเท่านั้น ไม่ได้เป็นเจ้าของ เราอาจปรับสมดุลของไอเทมหรือค่าต่างๆ เพื่อความเป็นธรรมของเกม
- อัตราการได้รับของจากกล่องสุ่มที่ขายด้วยเงินจริงหรือ Cash จะแสดงให้เห็นก่อนซื้อ
- ดูอัตราของแต่ละกล่องได้ที่ [หน้าอัตรากล่องสุ่ม]({{oddsUrl}})

## 4. สิ่งที่ห้ามทำ
- โกง ใช้โปรแกรมช่วย ใช้บอท หรือแก้ไข/ดัดแปลงไฟล์และการสื่อสารของเกม
- **ซื้อ ขาย หรือแลกเปลี่ยนบัญชี เงินในเกม หรือไอเทมด้วยเงินจริงหรือสิ่งมีค่านอกเกม (RMT)**
- ใช้ช่องโหว่หรือบั๊กเพื่อแสวงหาประโยชน์ และไม่แจ้งทีมงาน
- ขัดขวางการให้บริการ หรือพยายามเข้าถึงระบบโดยไม่ได้รับอนุญาต
- แอบอ้างเป็นทีมงานหรือผู้เล่นอื่น

**บทลงโทษ:** ขึ้นกับความร้ายแรง เราอาจเตือน จำกัดการใช้งานบางส่วน ระงับบัญชีชั่วคราว แบนถาวร และลบไอเทมหรือเงินในเกมที่ได้มาโดยไม่ชอบ โดยไม่ต้องคืนสิ่งใดให้

## 5. กฎแชทและชุมชน
- ห้ามใช้ถ้อยคำหยาบคาย คุกคาม เหยียดหยาม หรือล่วงละเมิดผู้อื่น
- ห้ามโพสต์เนื้อหาผิดกฎหมาย ลามกอนาจาร หรือโฆษณา/ชักชวนนอกเกม
- ห้ามเปิดเผยข้อมูลส่วนบุคคลของผู้อื่น
- เราเก็บและตรวจสอบข้อความแชทเพื่อบังคับใช้กฎเหล่านี้ และกรองคำไม่เหมาะสม ท่านสามารถบล็อกผู้เล่นได้ในเกม
- พบผู้เล่นหรือเนื้อหาที่ไม่เหมาะสม รายงานได้ที่ {{reportEmail}} (ดูรายละเอียดที่หน้าซัพพอร์ต)

## 6. การซื้อและการคืนเงิน
- การซื้อผ่าน App Store หรือ Google Play ใช้นโยบายการคืนเงินของ Apple หรือ Google ตามลำดับ ท่านต้องขอคืนเงินผ่านสโตร์นั้น
- หากซื้อแล้วไม่ได้รับสินค้าในเกม แจ้งเราพร้อมหลักฐานการชำระเงินที่ {{email}}
- ไอเทมที่ใช้ไปแล้วหรือบัญชีที่ถูกระงับเพราะผิดข้อตกลง ไม่มีสิทธิ์ขอคืนเงินจากเรา

## 7. ทรัพย์สินทางปัญญา
เกม เนื้อหา ภาพ เสียง และเครื่องหมายการค้าที่เกี่ยวข้อง เป็นของเราหรือผู้ให้สิทธิ์ ท่านได้รับสิทธิ์ใช้งานส่วนตัวแบบไม่ผูกขาดและโอนต่อไม่ได้ เพื่อเล่นเกมตามข้อตกลงนี้ ห้ามคัดลอก ดัดแปลง หรือนำไปใช้เชิงพาณิชย์โดยไม่ได้รับอนุญาต

## 8. การเปลี่ยนแปลงและการหยุดให้บริการ
เราอาจปรับปรุง เปลี่ยนแปลง หรือหยุดให้บริการเกมทั้งหมดหรือบางส่วนได้ โดยจะแจ้งล่วงหน้าตามสมควรเท่าที่ทำได้ เราอาจระงับหรือยกเลิกบัญชีที่ละเมิดข้อตกลงนี้

## 9. ข้อจำกัดความรับผิด
เกมให้บริการตามสภาพที่เป็นอยู่ เราจะพยายามให้บริการอย่างต่อเนื่องแต่ไม่รับประกันว่าจะไม่มีการหยุดชะงักหรือข้อผิดพลาด เท่าที่กฎหมายอนุญาต เราไม่รับผิดชอบต่อความเสียหายทางอ้อมหรือการสูญเสียข้อมูลที่ไม่ได้เกิดจากความผิดของเรา

## 10. ข้อกำหนดเพิ่มเติมสำหรับ App Store และ Google Play
- ข้อตกลงนี้เป็นข้อตกลงระหว่างท่านกับเราเท่านั้น ไม่ใช่กับ Apple หรือ Google
- Apple และ Google ไม่มีหน้าที่ให้บริการบำรุงรักษาหรือซัพพอร์ตแอป หากมีปัญหา ติดต่อเราที่ {{email}}
- หากแอปไม่เป็นไปตามที่รับประกัน ท่านขอคืนเงินค่าซื้อแอปได้ตามนโยบายของสโตร์ ข้อเรียกร้องอื่นเกี่ยวกับแอปให้ยื่นต่อเรา
- สำหรับ iOS: Apple และบริษัทในเครือเป็นผู้รับประโยชน์ของข้อตกลงนี้ และมีสิทธิ์บังคับใช้ข้อตกลงนี้กับท่านได้
- ท่านยืนยันว่าไม่ได้อยู่ในประเทศที่ถูกรัฐบาลสหรัฐฯ คว่ำบาตรหรือกำหนดเป็นประเทศสนับสนุนการก่อการร้าย

## 11. กฎหมายที่ใช้บังคับ
ข้อตกลงนี้อยู่ภายใต้กฎหมายไทย ข้อพิพาทอยู่ในเขตอำนาจของศาลไทย

## 12. การเปลี่ยนแปลงข้อตกลง และติดต่อเรา
ข้อตกลงนี้มีผลตั้งแต่วันที่ {{updated}} เมื่อมีการเปลี่ยนแปลงสำคัญ เราจะแจ้งในเกมหรือบนเว็บไซต์ การใช้เกมต่อหลังการแจ้งถือว่ายอมรับข้อตกลงที่แก้ไข
{{company}}
อีเมล: {{email}}`;

const termsBodyEn = `## 1. Acceptance
These terms apply to the game {{app}} and the website {{site}}. By creating an account, installing or playing the game you accept these terms and our privacy policy. If you do not accept them, please do not use the service.

These terms are an agreement between you and {{company}} ("we").

## 2. Player accounts
- Players must be {{minAge}} years old or older.
- You must give accurate information and you are responsible for everything that happens under your account.
- Keep your username and password secret and do not let others use your account.
- If you suspect unauthorised use, tell us immediately at {{email}}.

## 3. In-game currency and items
- In-game currency (such as Rain, Cash and RP) and all items have no real-world monetary value and cannot be exchanged for money.
- You receive only a right to use them in the game; you do not own them. We may rebalance items or values for the fairness of the game.
- The drop rates of loot boxes sold for real money or Cash are shown before you buy.
- See the rates of each box on the [loot box odds page]({{oddsUrl}}).

## 4. What is not allowed
- Cheating, using cheat software or bots, or modifying the game's files or communications
- **Buying, selling or trading accounts, in-game currency or items for real money or anything of value outside the game (RMT)**
- Exploiting bugs or loopholes without reporting them
- Disrupting the service or trying to access our systems without permission
- Impersonating staff or other players

**Penalties:** depending on severity we may warn you, restrict features, suspend your account temporarily, ban it permanently, and remove items or currency obtained improperly, with nothing refunded.

## 5. Chat and community rules
- No abusive, threatening, discriminatory or harassing language
- No illegal or sexually explicit content, and no advertising or solicitation outside the game
- Do not reveal other people's personal data
- We store and review chat messages to enforce these rules and filter inappropriate words. You can block players in the game.
- To report a player or content, write to {{reportEmail}} (see the Support page for details).

## 6. Purchases and refunds
- Purchases made through the App Store or Google Play follow Apple's or Google's refund policy respectively. You must request refunds through that store.
- If you paid but did not receive the item in the game, contact us with proof of payment at {{email}}.
- Items already used, or accounts suspended for breaking these terms, are not eligible for a refund from us.

## 7. Intellectual property
The game, its content, images, sounds and related trademarks belong to us or our licensors. You receive a personal, non-exclusive, non-transferable right to play the game under these terms. You may not copy, modify or use them commercially without permission.

## 8. Changes and discontinuation
We may update, change or discontinue all or part of the game, and will give reasonable notice where possible. We may suspend or terminate accounts that breach these terms.

## 9. Limitation of liability
The game is provided "as is". We work to keep it available but do not guarantee it will be free of interruptions or errors. To the extent permitted by law, we are not liable for indirect damages or data loss not caused by our fault.

## 10. Additional terms for the App Store and Google Play
- This agreement is between you and us only, not Apple or Google.
- Apple and Google have no obligation to provide maintenance or support for the app. For any problem, contact us at {{email}}.
- If the app fails to conform to a warranty, you may request a refund of the purchase price from the store according to its policy; other claims about the app should be made to us.
- For iOS: Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.
- You confirm you are not located in a country subject to a U.S. government embargo or designated as a terrorist-supporting country.

## 11. Governing law
These terms are governed by the laws of Thailand and disputes are subject to the courts of Thailand.

## 12. Changes to these terms, and contact
These terms are effective from {{updated}}. When we make significant changes we will tell you in the game or on the website; continuing to play after notice means you accept the updated terms.
{{company}}
Email: {{email}}`;

const supportBody = `## ติดต่อเราเรื่องอะไรได้บ้าง
- **เข้าเกมหรือสมัครไม่ได้**: แจ้งชื่อผู้ใช้ รุ่นอุปกรณ์ และภาพหน้าจอข้อความที่ขึ้น
- **การซื้อและการคืนเงิน**: การซื้อผ่าน App Store / Google Play ต้องขอคืนเงินผ่านสโตร์นั้นตามนโยบายของสโตร์ หากไอเทมไม่ถึงบัญชี แจ้งเราพร้อมใบเสร็จ
- **ข้อมูลส่วนบุคคลและการลบบัญชี**: ขอดู แก้ไข หรือลบบัญชีและข้อมูลของท่าน แจ้งที่ {{email}} เราลบถาวรภายใน {{deleteDays}} วันหลังยืนยันคำขอ
- **ลบบัญชี**: ดูขั้นตอนและข้อมูลที่ถูกลบที่ [หน้าลบบัญชี]({{deleteUrl}})
- **อื่นๆ**: ข้อเสนอแนะ ความร่วมมือ และข่าวสาร

## รายงานผู้เล่นหรือเนื้อหาที่ไม่เหมาะสม {#report}
เกมมีแชทระหว่างผู้เล่น หากพบผู้เล่นหรือข้อความที่ไม่เหมาะสม (คำหยาบ คุกคาม โกง ซื้อขายบัญชี หรือเนื้อหาผิดกฎหมาย) รายงานได้ที่ {{reportEmail}}
ข้อมูลที่ควรแนบ: ชื่อตัวละครของผู้ถูกรายงาน วันเวลาที่เกิดเหตุ ข้อความหรือภาพหน้าจอ และชื่อตัวละครของท่าน ทีมงานจะตรวจสอบและดำเนินการตามกฎ ท่านสามารถ **บล็อกผู้เล่น** ได้ในเกมเพื่อไม่ให้เห็นข้อความของเขาทันที

## กฎชุมชนโดยสรุป
- เคารพผู้เล่นคนอื่น ไม่ใช้คำหยาบ ไม่คุกคาม ไม่เหยียดหยาม
- ไม่โกง ไม่ใช้โปรแกรมช่วย ไม่ใช้บอท
- ไม่ซื้อขายบัญชีหรือไอเทมด้วยเงินจริง
- ไม่เปิดเผยข้อมูลส่วนบุคคลของตนเองหรือผู้อื่น
- ผู้ฝ่าฝืนอาจถูกเตือน ระงับ หรือแบนบัญชี รายละเอียดอยู่ใน [ข้อตกลงการใช้บริการ](/terms)

## ข้อมูลที่ช่วยให้เราตอบเร็วขึ้น
- ชื่อผู้ใช้หรือชื่อตัวละครในเกม
- รุ่นอุปกรณ์และเวอร์ชันระบบ (เช่น Android 14, iOS 17) และเวอร์ชันแอป
- เกิดอะไรขึ้น เมื่อไหร่ และภาพหน้าจอ (ถ้ามี)

เวลาตอบกลับโดยประมาณ: {{response}}`;

const supportBodyEn = `## What can you contact us about?
- **Cannot log in or sign up**: tell us your username, device model and a screenshot of the message you see
- **Purchases and refunds**: purchases made through the App Store / Google Play must be refunded through that store under its policy. If an item did not reach your account, contact us with the receipt
- **Personal data and account deletion**: ask to see, correct or delete your account and data at {{email}}. We permanently delete data within {{deleteDays}} days after the request is confirmed
- **Delete account**: see the steps and what is deleted on the [account deletion page]({{deleteUrl}})
- **Other**: feedback, partnerships and news

## Report a player or inappropriate content {#report}
The game has chat between players. If you find a player or message that is inappropriate (abusive or threatening language, cheating, account trading, or illegal content), report it to {{reportEmail}}
Please include: the reported character's name, when it happened, the message or a screenshot, and your own character name. Our team reviews reports and acts under the rules. You can also **block a player** in the game to stop seeing their messages immediately.

## Community rules in short
- Respect other players: no abusive, threatening or demeaning language
- No cheating, cheat software or bots
- No buying or selling accounts or items for real money
- Do not share your own or other people's personal data
- Violations may lead to a warning, suspension or ban. Details are in the [Terms of Service]({{termsUrl}})

## Information that helps us reply faster
- Your username or in-game character name
- Device model, system version (for example Android 14, iOS 17) and app version
- What happened, when, and a screenshot if you have one

Estimated reply time: {{response}}`;

const supportFaq = [
  { id: 's1', q: 'ลืมรหัสผ่านทำอย่างไร', a: 'ส่งอีเมลถึง {{email}} พร้อมชื่อผู้ใช้และอีเมลที่ใช้สมัคร เพื่อให้เราช่วยยืนยันตัวตนและตั้งรหัสผ่านใหม่ เราไม่เคยขอรหัสผ่านปัจจุบันของท่านทางอีเมลหรือแชท',
    qEn: 'I forgot my password. What should I do?', aEn: 'Email {{email}} with your username and the email you signed up with, so we can verify your identity and help you set a new password. We never ask for your current password by email or chat.' },
  { id: 's2', q: 'ติดตั้งหรืออัปเดตเกมอย่างไร', a: 'ดาวน์โหลดและอัปเดตจาก App Store (iOS) หรือ Google Play (Android) เท่านั้น ตรวจให้แน่ใจว่าเครื่องมีพื้นที่ว่างพอ และระบบปฏิบัติการเป็นเวอร์ชันที่แอปรองรับ หากอัปเดตไม่ได้ ลองปิดแล้วเปิดสโตร์ใหม่ หรือรีสตาร์ทเครื่อง',
    qEn: 'How do I install or update the game?', aEn: 'Download and update only from the App Store (iOS) or Google Play (Android). Make sure your device has enough free space and runs a supported system version. If the update fails, close and reopen the store or restart your device.' },
  { id: 's3', q: 'ใช้เน็ตมือถือเล่นได้ไหม', a: 'เล่นได้ แต่เกมโหลดข้อมูลค่อนข้างมาก โดยเฉพาะตอนติดตั้งและอัปเดต แนะนำให้ใช้ Wi-Fi เพื่อไม่ให้เสียค่าอินเทอร์เน็ตเกินแพ็กเกจ',
    qEn: 'Can I play on mobile data?', aEn: 'Yes, but the game downloads a lot of data, especially when installing and updating. We recommend Wi-Fi so you do not exceed your data plan.' },
  { id: 's4', q: 'พบบั๊กหรือเกมค้าง แจ้งอย่างไร', a: 'ส่งอีเมลถึง {{email}} พร้อมรุ่นอุปกรณ์ เวอร์ชันระบบและแอป ขั้นตอนที่ทำให้เกิดปัญหา และภาพหน้าจอหรือคลิป เพื่อให้ทีมงานตรวจสอบได้เร็วขึ้น',
    qEn: 'How do I report a bug or a freeze?', aEn: 'Email {{email}} with your device model, system and app versions, the steps that cause the problem, and a screenshot or video, so our team can investigate faster.' },
  { id: 's5', q: 'รายงานผู้เล่นที่ใช้คำไม่เหมาะสมหรือโกงได้อย่างไร', a: 'ส่งรายงานถึง {{reportEmail}} พร้อมชื่อตัวละคร วันเวลา และภาพหน้าจอแชท ดูรายละเอียดที่หัวข้อ "รายงานผู้เล่นหรือเนื้อหาที่ไม่เหมาะสม" ด้านบน และท่านบล็อกผู้เล่นได้ในเกมทันที',
    qEn: 'How do I report a player for inappropriate language or cheating?', aEn: 'Send a report to {{reportEmail}} with the character name, date and time, and a chat screenshot. See "Report a player or inappropriate content" above. You can also block a player in the game right away.' },
  { id: 's6', q: 'ต้องการลบบัญชีและข้อมูลของฉัน', a: 'ส่งคำขอลบบัญชีมาที่ {{email}} จากอีเมลที่ใช้สมัคร พร้อมชื่อผู้ใช้ เมื่อยืนยันตัวตนแล้ว เราจะลบข้อมูลของท่านอย่างถาวรภายใน {{deleteDays}} วัน ข้อมูลที่ต้องเก็บตามกฎหมายหรือเพื่อป้องกันการโกงจะเก็บเท่าที่จำเป็นเท่านั้น (ดูนโยบายความเป็นส่วนตัว)\n\nหรือทำตามขั้นตอนที่ [หน้าลบบัญชี]({{deleteUrl}})',
    qEn: 'I want to delete my account and data', aEn: 'Send an account deletion request to {{email}} from the email you signed up with, together with your username. Once we verify your identity, we permanently delete your data within {{deleteDays}} days. Data we must keep by law or to prevent cheating is kept only as long as necessary (see the privacy policy).\n\nOr follow the steps on the [account deletion page]({{deleteUrl}}).' }
];

const cookiesEn = {
  titleEn: 'We use cookies',
  textEn: 'This website uses necessary cookies to work, and analytics cookies (only with your consent) to count visitors and improve the site. You can accept all, decline the non-essential ones, or choose, and change your mind at any time.',
  policyLabelEn: 'Read the privacy policy',
  acceptAllEn: 'Accept all',
  rejectAllEn: 'Decline non-essential',
  customizeEn: 'Settings',
  saveEn: 'Save settings',
  settingsTitleEn: 'Cookie settings',
  necessaryTitleEn: 'Necessary cookies',
  necessaryDescEn: 'Needed for the website to work, for example remembering your cookie choice and sound setting. Cannot be turned off.',
  analyticsTitleEn: 'Analytics cookies',
  analyticsDescEn: 'Help us count unique visitors, device types and popular pages, without your name or email.',
  settingsLinkEn: 'Cookie settings'
};

module.exports = {
  privacyBody, privacyBodyEn, termsBody, termsBodyEn, supportBody, supportBodyEn, supportFaq,
  cookies: Object.assign({
    enabled: 'true',
    version: '1',
    title: 'เราใช้คุกกี้',
    text: 'เว็บไซต์นี้ใช้คุกกี้ที่จำเป็นเพื่อให้ทำงานได้ และคุกกี้สถิติ (ต้องได้รับความยินยอมจากท่าน) เพื่อนับจำนวนผู้เข้าชมและปรับปรุงเว็บไซต์ ท่านเลือกได้ว่าจะยอมรับทั้งหมด ปฏิเสธที่ไม่จำเป็น หรือตั้งค่าเอง และเปลี่ยนใจได้ทุกเมื่อ',
    policyLabel: 'อ่านนโยบายความเป็นส่วนตัว',
    acceptAll: 'ยอมรับทั้งหมด',
    rejectAll: 'ปฏิเสธที่ไม่จำเป็น',
    customize: 'ตั้งค่า',
    save: 'บันทึกการตั้งค่า',
    settingsTitle: 'ตั้งค่าคุกกี้',
    necessaryTitle: 'คุกกี้ที่จำเป็น',
    necessaryDesc: 'จำเป็นต่อการทำงานของเว็บไซต์ เช่น จำการตัดสินใจเรื่องคุกกี้และการตั้งค่าเสียง ปิดไม่ได้',
    analyticsTitle: 'คุกกี้สถิติการเข้าชม',
    analyticsDesc: 'ช่วยให้เรารู้จำนวนผู้เข้าชมไม่ซ้ำ ประเภทอุปกรณ์ และหน้าที่คนสนใจ โดยไม่ระบุชื่อหรืออีเมลของท่าน',
    settingsLink: 'ตั้งค่าคุกกี้',
    anonymousCount: 'true'
  }, cookiesEn),
  contact: {
    company: '',
    address: '',
    email: '',
    reportEmail: '',
    phone: '',
    line: '',
    hours: 'จันทร์–ศุกร์ 10:00–18:00 น. (เวลาประเทศไทย)',
    response: 'ภายใน 2 วันทำการ',
    hoursEn: 'Mon–Fri 10:00–18:00 (Thailand time)',
    responseEn: 'Within 2 business days'
  },
  // values used inside the privacy policy and terms (confirm them against the store age rating and your deletion process)
  legal: { minAge: '13', deleteDays: '30' }
};
