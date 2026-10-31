# БММС API

Бүлгийн менежментийн мэдээллийн системийн REST API. Node.js 20+, Express 4, MySQL 8 (`bmms-db`), JWT.

## Ажиллуулах

```bash
npm ci
cp .env.example .env          # утгуудыг бөглөнө
# JWT_SECRET, MFA_PEPPER:  openssl rand -hex 32
# FIELD_KEYS:              npm run gen-key  →  {"k2026a":"<гарсан утга>"}
npm run migrate               # өгөгдлийн санг үүсгэж, шинэ migration-ыг ажиллуулна
npm start                     # http://localhost:8080
```

`.env` файлыг Node 20.6+ дээр `node --env-file=.env ...` гэж уншуулж болно.

Анхны admin хэрэглэгчийг нууц үг дамжуулахгүйгээр үүсгэнэ. Санамсаргүй нууц үгтэй бүртгэл үүсгээд, тохируулах холбоосыг имэйлээр илгээнэ:

```bash
ADMIN_EMAIL=admin@tsetserleg.mn node --env-file=.env scripts/create-user.js --send-reset
```

AWS дээр үүнийг `createadmin` task гүйцэтгэнэ (`bmms-infra/README.md`-ийг үзнэ үү). Локал орчинд нууц үгийг орчны хувьсагчаар өгч болно: `BMMS_NEW_PASSWORD=... node scripts/create-user.js <имэйл> admin`.

Admin анх нэвтрэхдээ хоёр шатлалт баталгаажуулалтаа тохируулна. Үлдсэн хэрэглэгчдийг `POST /api/v1/admin/users`-ээр нэмнэ.

| Скрипт | Зориулалт |
| --- | --- |
| `scripts/migrate.js` | Migration (DDL эрхтэй хэрэглэгчээр) |
| `scripts/db-user.js` | API-ийн DB хэрэглэгчийг `bmms_app` role-той үүсгэж, нууц үгийг шинэчилнэ (idempotent, `REQUIRE SSL`) |
| `scripts/create-user.js` | Анхны admin |
| `scripts/retention.js` | Хадгалалтын хугацаа дууссан мэдээллийг устгах |
| `scripts/seed-demo-users.js` | Зөвхөн CI/E2E: demo хэрэглэгчдэд нууц үг тохируулна (production-д хориотой) |

## Өгөгдлийн сан ба migration

Схем `db/migrations/V<дугаар>__<тайлбар>.sql` файлуудад байна (Flyway-ийн нэршилтэй тул шаардлагатай бол Flyway руу шилжиж болно).

| Команд | Үйлдэл |
| --- | --- |
| `npm run migrate` | Хүлээгдэж буй migration-ыг дарааллаар ажиллуулна |
| `npm run migrate -- --status` | Аль нь ажилласан, аль нь хүлээгдэж буйг харуулна |
| `npm run migrate -- --seed db/seeds/demo_data.sql` | Жишээ өгөгдөл ачаална (production-д хориотой) |

- Migration-ыг `MIGRATE_DB_USER`-ээр ажиллуулна. Энэ хэрэглэгч DDL болон CREATE ROLE эрхтэй байх ёстой (RDS master). API-ийн `bmms_app` хэрэглэгч хүснэгт үүсгэх, өөрчлөх эрхгүй.
- `schema_migrations` хүснэгт файл бүрийн SHA-256 хэшийг хадгална. Ажилласан файлыг засвал runner зогсоно. Өөрчлөлтийг үргэлж шинэ `V<n+1>` файлаар нэмнэ.
- Хоёр task нэгэн зэрэг migration ажиллуулахаас `GET_LOCK` хамгаална.
- MySQL-д DDL transaction-гүй. Migration дундаа алдаа гарвал runner зогсох тул гараар засаад дахин ажиллуулна. Тиймээс production-д ажиллуулахын өмнө staging дээр заавал турших хэрэгтэй.
- Production-д migration-ыг deploy бүрийн өмнө нэг удаагийн ECS task болгож ажиллуулна (`node scripts/migrate.js`, image-д `db/` хавтас багтсан).

## Хадгалалтын хугацаа

`scripts/retention.js` нь бүх бүлгээс гарснаас хойш `RETENTION_YEARS` жил өнгөрсөн хүүхдийн бүх мэдээллийг устгана. Үүнд ирц, үнэлгээ, эрүүл мэнд, ганцаарчилсан сургалт хамаарна. Мөн аль ч хүүхэдтэй холбоогүй болсон асран хамгаалагч болон 30 хоногоос өмнө дууссан сессийг цэвэрлэнэ.

```bash
RETENTION_YEARS=3 npm run retention              # зөвхөн тоолно
RETENTION_YEARS=3 npm run retention -- --apply   # устгана
```

- Хугацааг хуульчийн зөвлөгөө, цэцэрлэгийн журмаар тогтооно. `RETENTION_YEARS` заагаагүй бол скрипт ажиллахгүй.
- Production-д EventBridge Scheduler-ээр өдөр бүр ECS task болгон ажиллуулна.
- Устгалт бүр `audit_log`-д бүртгэгдэнэ.

## Нууц үг сэргээх ба имэйл

Хэрэглэгч нэвтрэх хуудаснаас «Нууц үгээ мартсан уу?» гэж дарж имэйлээ оруулна. Admin нь нууц үгийг мэдэлгүйгээр «Холбоос илгээх» (`POST /admin/users/:id/send-reset`) үйлдлээр мөн илгээж болно.

**Хамгаалалт:**
- **Ижил хариу.** Бүртгэлтэй, бүртгэлгүй имэйлд ижил хариу (`202`) өгнө. Имэйлийг хариуны дараа илгээдэг тул хариуны хугацаагаар бүртгэлтэй эсэхийг ялгах боломжгүй.
- **Токен.** 256 бит санамсаргүй токен үүсгэнэ. DB-д зөвхөн SHA-256 хэш нь хадгалагдана.
  - `PASSWORD_RESET_TTL_MIN` (анхдагч 30 минут) хугацаанд хүчинтэй, нэг л удаа ашиглагдана.
  - Шинэ хүсэлт гаргахад өмнөх холбоос хүчингүй болно.
  - Нэг хэрэглэгч цагт `PASSWORD_RESET_PER_HOUR` (анхдагч 3)-аас олон хүсэлт гаргавал имэйл илгээхгүй.
- **Холбоос.** `APP_URL/nuuts-ug-sergeeh#token=…` хэлбэртэй. Токен URL-ийн fragment хэсэгт байгаа тул сервер, CloudFront-ийн лог болон Referer толгойд дамжихгүй. Frontend уншмагц хаягаас арилгана.
- **MFA.** Хэрэглэгчид MFA идэвхтэй бол имэйлээс гадна апп-ын код эсвэл нөөц кодыг шаардана. Ингэснээр имэйл алдагдсан ч бүртгэлийг булааж авах боломжгүй. Буруу кодыг нэвтрэлтийн адил тоолж түгжинэ.
- **Амжилттай солигдсоны дараа:**
  - Бүх сесс болон access token тэр даруй хүчингүй болно (`token_huchingui_ognoo`).
  - Түгжээ болон түр нууц үгийн шаардлага арилна.
  - Эзэнд нь «нууц үг солигдлоо» мэдэгдэл очно. Энэ мэдэгдэл `change-password`-оор солиход ч илгээгдэнэ.

**AWS SES тохиргоо (production):**
- Илгээх домэйныг SES-д баталгаажуулж, DKIM, SPF, DMARC бичлэгийг DNS-д нэмнэ.
- SES-ийг sandbox горимоос production access руу шилжүүлнэ.
- ECS task role-д зөвхөн тухайн identity-гээр илгээх `ses:SendEmail` эрх олгоно. Статик нууц түлхүүр ашиглахгүй.
- Bounce, complaint-ийг хянахын тулд Configuration set (`SES_CONFIGURATION_SET`) тохируулна.
- Production орчинд `MAIL_PROVIDER=ses` болон `https://` хаягтай `APP_URL` заагаагүй бол сервер асахгүй. `console` горим нь сэргээх холбоосыг логт бичдэг тул production-д хориотой.

## Тест

Шинээр ачаалсан өгөгдлийн сан (`01`–`05`) дээр, `bmms_app` эрхтэй хэрэглэгчээр ажиллана:

```bash
npm run migrate && npm run migrate -- --seed db/seeds/demo_data.sql
DB_HOST=127.0.0.1 DB_USER=bmms_api_test DB_PASSWORD=... npm test
```

Нийт 22 тест дөрвөн файлд хуваагдсан. MySQL 8.0 болон 8.4 (RDS-ийн одоо дэмжигдэж буй хувилбар) дээр бүгд давна. Тест бүр бодит MySQL дээр, хамгийн бага эрхтэй хэрэглэгчээр хандалтыг шалгана. Шалгадаг зүйлс:
- Нэвтрэлт: refresh token-ийг ээлжлэн солих, хулгайлагдсан токен дахин ирэхийг илрүүлэх, бүртгэл түгжигдэх.
- Мөрийн түвшний хандалт: багш, арга зүйч, admin тус бүрийн хүрээ.
- Ирцийн нэгтгэлийн тооцоо.
- Батлах урсгал: илгээх, буцаах, засах, батлах.
- Шифрлэлтийн бүрэн бүтэн байдал.
- Аудитын хүснэгтийг API унших эрхгүй байх.
- MFA: RFC 6238-ийн тест векторууд, кодыг дахин ашиглахыг хориглох, нөөц код нэг удаа ажиллах, таах оролдлогыг түгжих.
- Түр нууц үгтэй хэрэглэгч бусад API-д хандаж чадахгүй байх.
- CSV оруулах: мөр бүрийн алдаа, бүгд эсвэл юу ч үгүй.
- Хадгалалтын хугацааны скрипт, migration-ий SQL задлагч.
- Нууц үг сэргээх: ижил хариу, нэг удаагийн токен, хугацаа дуусах, давтамжийн хязгаар, MFA шаардах, сэргээсний дараа хуучин access token хүчингүй болох.

## Хэрэглэгчийн эрх

| Үүрэг | Хүрээ |
| --- | --- |
| `bagsh` | Өөрийн бүлэг (бүлгийн эсвэл туслах багш): унших, бичих |
| `arga_zuich` | Өөрийн цэцэрлэгийн бүх бүлэг: унших, батлах/буцаах, хоолны үнэ, амралтын өдөр, хяналтын асуулт |
| `admin` | Хэрэглэгч, цэцэрлэг, хичээлийн жил, бүлэг. **Хүүхдийн мэдээлэл харахгүй** |

Хандах эрхгүй бүлэг, хүүхэд рүү хандвал API `404` буцаана, ингэснээр тэдгээр байгаа эсэхийг задруулахгүй. Батлах эрхийг `sp_batlah_urgal` процедур өгөгдлийн сангийн түвшинд дахин шалгана.

## Endpoint (`/api/v1`)

| Бүлэг | Endpoint |
| --- | --- |
| Нэвтрэлт | `POST /auth/login`, `POST /auth/mfa/verify`, `POST /auth/refresh`, `POST /auth/logout`, `GET/PATCH /auth/me`, `POST /auth/change-password` |
| Нууц үг сэргээх | `POST /auth/password/forgot`, `POST /auth/password/reset/check`, `POST /auth/password/reset` |
| MFA | `POST /auth/mfa/setup`, `POST /auth/mfa/activate`, `POST /auth/mfa/recovery-codes`, `POST /auth/mfa/disable` |
| Admin | `GET/POST /admin/users`, `PATCH /admin/users/:id` (`mfa_reset`, `nuuts_ug`, `tuluv`), `POST /admin/users/:id/send-reset`, `GET /teachers`, `POST /kindergartens`, `POST /school-years`, `POST /groups`, `PATCH /groups/:id` |
| Тохиргоо | `GET /kindergartens`, `GET/POST /kindergartens/:id/meal-prices`, `GET/POST /holidays`, `DELETE /holidays/:id`, `GET /school-years`, `GET/POST /school-years/:id/periods`, `POST /checklist-items`, `PATCH /checklist-items/:id`, `GET /reference` |
| Бүлэг, хүүхэд | `GET /groups`, `GET /groups/:id`, `GET/POST /groups/:id/children`, `POST /groups/:id/children/import`, `GET/PATCH /children/:id`, `PUT /children/:id/address`, `POST /children/:id/leave` |
| Асран хамгаалагч | `POST /children/:id/guardians`, `PATCH/DELETE /children/:id/guardians/:asranId` |
| Эрүүл мэнд | `POST /children/:id/health`, `DELETE /health/:id` |
| Ирц | `GET/PUT /groups/:id/attendance?month=`, `POST /groups/:id/attendance/fill`, `GET /groups/:id/attendance/summary?period=month\|quarter\|year` |
| Фонт | `GET/PUT /groups/:id/fees` |
| Kinder police | `GET /groups/:id/kinder-police`, `POST /children/:id/kinder-police`, `DELETE /kinder-police/:id` |
| Өсөлт | `GET /groups/:id/growth`, `PUT /children/:id/growth` |
| Анги, танхим | `GET/POST /groups/:id/materials`, `PATCH/DELETE /materials/:id`, `GET/PUT /groups/:id/supplies`, `POST /groups/:id/supply-types`, `DELETE /supply-types/:id` |
| Үнэлгээ | `GET/PUT /groups/:id/rubric`, `GET /groups/:id/rubric/summary`, `GET /groups/:id/rubric/progress`, `GET/PUT /groups/:id/checklist`, `GET /groups/:id/checklist/summary`, `GET/PUT /self-eval`, `GET /groups/:id/plan-insight` |
| Төлөвлөгөө | `GET/POST /groups/:id/plans`, `GET/PATCH/DELETE /plans/:id`, `POST /plans/:id/transition`, `POST /plans/:id/comments` |
| Тайлан | `GET/POST /groups/:id/reports`, `GET/PATCH/DELETE /reports/:id`, `POST /reports/:id/transition`, `POST /reports/:id/comments`, `GET /approvals` |
| Ганцаарчилсан | `GET/POST /groups/:id/individual`, `GET/PUT/DELETE /individual/:id`, `POST /individual/:id/reports` |
| Систем | `GET /health` (liveness), `GET /ready` (DB) |

Бөөнөөр бичих endpoint-ууд (`PUT .../attendance`, `fees`, `rubric`, `checklist`, `supplies`) нь `{ "items": [...] }` хэлбэрийн өгөгдөл хүлээн авна. Утгыг `null` гэж явуулбал тухайн бичлэг устгагдана.

Алдааны хариу: `{ "error": { "code", "message", "details" } }`. Trigger-ийн монгол мессеж `422 RULE` кодоор шууд дамжина, жишээ нь «Ирээдүйн огноонд ирц бүртгэх боломжгүй».

## Аюулгүй байдлын шийдэл

- **Нууц үг.** scrypt (OWASP: N=2^15, r=8, p=3) ашиглана. Хамгийн багадаа 12 тэмдэгт, 3 төрлийн тэмдэгт агуулна. Хэрэглэгч олдоогүй үед ч хэш тооцоолж, хариуны хугацаагаар бүртгэлтэй эсэхийг таахаас сэргийлнэ.
- **Хоёр шатлалт баталгаажуулалт (MFA).**
  - TOTP (RFC 6238) ашиглана. Google болон Microsoft Authenticator-тай нийцтэй.
  - `MFA_REQUIRED_ROLES` (анхдагч: арга зүйч, admin)-д заавал, багшид сайн дурын.
  - Нууц түлхүүрийг AES-256-GCM-ээр шифрлэж хадгална. Нэг кодыг хоёр удаа ашиглах боломжгүй.
  - 10 нэг удаагийн нөөц код олгоно. DB-д зөвхөн HMAC хэш нь хадгалагдана.
  - Буруу код оруулахыг нууц үгийн адил тоолж түгжинэ.
  - Утсаа алдсан хэрэглэгчийн MFA-г admin тэглэнэ. Энэ үед хэрэглэгчийн бүх сесс хаагдана.
  - Нууц үгийн дараах 2-р алхмын түр токен 5 минут хүчинтэй бөгөөд өөр audience-тай тул access token-оор ашиглагдахгүй.
- **Түр нууц үг.** Admin-ий үүсгэсэн эсвэл шинэчилсэн нууц үгтэй хэрэглэгч нууц үгээ солих хүртэл зөвхөн `/auth/me` болон `/auth/change-password`-д хандана. Сервер бусад хүсэлтэд `403 PASSWORD_CHANGE_REQUIRED` буцаана. MFA заавал боловч тохируулаагүй хэрэглэгч адилхан хязгаарлагдана (`403 MFA_SETUP_REQUIRED`).
- **Нэвтрэх оролдлого.** 5 удаа буруу оролдвол бүртгэл 15 минут түгжигдэнэ. Нэг IP-ээс 15 минутад 10 оролдлого хийх хязгаартай. Бүх оролдлого `audit_log`-д `LOGIN` / `LOGIN_FAIL` гэж бүртгэгдэнэ.
- **Access token.** JWT HS256, 15 минут хүчинтэй. Алгоритм, issuer, audience-ийг заавал шалгана. Хэрэглэгчийн эрх, төлвийг хүсэлт бүрд DB-ээс дахин уншдаг тул идэвхгүй болсон хэрэглэгчийн токен тэр даруй хүчингүй болно. Нууц үг солих, сэргээх, admin эрх өөрчлөх, refresh token дахин ашиглагдах үед тухайн мөчөөс өмнө олгосон бүх access token хүчингүй болно.
- **Refresh token.**
  - `HttpOnly; Secure; SameSite=Strict` cookie-д хадгалагдаж, зөвхөн `/api/v1/auth` замд илгээгдэнэ.
  - DB-д зөвхөн SHA-256 хэш нь хадгалагдана.
  - Ашиглах бүрд шинэ токеноор солигдоно. Хуучин токен дахин ирвэл хулгайлагдсан гэж үзээд тухайн хэрэглэгчийн бүх сессийг цуцална.
  - `X-Requested-With: bmms` толгой заавал шаардана.
- **Шифрлэлт (SR107).** Ганцаарчилсан сургалтын онош, ажиглалт, тайланг AES-256-GCM-ээр шифрлэнэ.
  - AAD нь шифрлэгдсэн утгыг тухайн мөр, баганад уяна. Тиймээс өөр хүүхдийн мөрөнд хуулбал тайлагдахгүй.
  - Ийм эвдрэл илэрвэл API `INTEGRITY` алдаа буцааж, логт бүртгэнэ.
  - Унших бүрийг `audit_log`-д `READ` гэж бүртгэнэ.
  - `key_id` баганын ачаар түлхүүрийг солих боломжтой: шинэ түлхүүрийг нэмж идэвхжүүлэхэд хуучин түлхүүрээр шифрлэсэн бичлэгүүд тайлагдсаар байна.
- **Бусад хамгаалалт.**
  - Бүх оролтыг zod-оор шалгана.
  - SQL нь параметртэй бөгөөд `multipleStatements` хаалттай.
  - helmet-ийн аюулгүй байдлын толгойнууд, CORS allowlist, хариунд `Cache-Control: no-store`.
  - Хүсэлтийн хэмжээ 200kb-аас ихгүй, ерөнхий хурдны хязгаар минутад 300 хүсэлт.
  - Логт `authorization`, `cookie`, `set-cookie` толгой бичигдэхгүй.
- **CSV оруулах.** `POST /groups/:id/children/import` нэг удаад `IMPORT_MAX_ROWS` (анхдагч 300) мөр хүлээн авна. `dry_run: true` үед зөвхөн шалгана. Алдаатай мөр байвал нэг ч мөр хадгалагдахгүй бөгөөд мөр, талбар бүрийн алдааг буцаана. Файлын РД давхардал болон DB-д аль хэдийн бүртгэлтэй РД-г шалгана.
- **Production шаардлага.** `DB_SSL_CA`, `COOKIE_SECURE=true`, `CORS_ORIGINS` гурвыг заагаагүй бол сервер асахгүй.

## AWS ECS дээр

- Image: `docker build -t bmms-api .` Image нь non-root хэрэглэгчээр ажиллаж, RDS CA bundle агуулна. Үүнийг ECR-д түлхэж, сканнердана.
- Нууц мэдээлэл (`DB_PASSWORD`, `JWT_SECRET`, `FIELD_KEYS`, `MFA_PEPPER`)-ийг task definition-ий `secrets` хэсгээр Secrets Manager-ээс дамжуулна.
- Нэг image-ээс гурван төрлийн task ажиллана: API service, deploy бүрийн өмнөх migration task (`node scripts/migrate.js`), өдөр бүрийн retention task.
- ALB health check-ийг `/ready`, container health check-ийг `/health` гэж тохируулна. `TRUST_PROXY=1`.
- Олон task ажиллуулбал login-ийн хурдны хязгаар task бүрд тусдаа тоологдоно. Нийтэд нь хязгаарлахын тулд AWS WAF rate-based rule нэмнэ.

## Хэрэгжээгүй

- **Шинжилгээний зураг хадгалах.** S3 presigned URL ашиглан `havsralt` хүснэгттэй холбох шаардлагатай.
- **ДАН (SR101) нэвтрэлт, ESIS / «Их нүүдэл» интеграци (OR103).** Эдгээр нь тусдаа гэрээ, API хандалт шаардана.
- **OpenAPI баримт бичиг.**
