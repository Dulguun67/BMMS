# БММС дэд бүтэц ба CI/CD (staging)

Terraform (AWS provider 6.x) болон GitHub Actions ашиглана. Staging-д **зөвхөн жишээ өгөгдөл** байршуулна: бодит хүүхдийн мэдээлэл оруулахгүй.

## Бүтэц

```
Хэрэглэгч ──HTTPS──► CloudFront + WAF ──► S3 (React, хаалттай, OAC)
                         │ /api/*  (X-Origin-Verify нууц толгой)
                         ▼
                    ALB (зөвхөн CloudFront prefix list) ──► ECS Fargate: API (private subnet)
                                                              │ TLS заавал
                                                              ▼
                                                   RDS MySQL 8.4 (isolated subnet, KMS)
```

| Хэсэг | Тохиргоо |
| --- | --- |
| Сүлжээ | 2 AZ; public / private / isolated subnet, NAT (staging-д 1), S3 gateway endpoint, VPC Flow Logs |
| Өгөгдлийн сан | RDS MySQL **8.4** (8.0-ийн RDS стандарт дэмжлэг 2026-07-31-нд дууссан), KMS, TLS заавал, master нууц үгийг RDS өөрөө удирдана, төлбөртэй Extended Support руу автоматаар орохгүй |
| API | ECS Fargate. Root файлын систем зөвхөн уншигдана, ECS Exec (контейнер руу shell) хаалттай, нууцыг Secrets Manager-ээс авна |
| Нэг удаагийн task | `migrate` (deploy бүрд), `dbuser` (API-ийн DB хэрэглэгч, deploy бүрд), `createadmin` (анхны admin), `retention` (хугацаа тогтоосны дараа өдөр бүр) |
| Frontend | S3 + CloudFront, SPA function, CSP/HSTS толгой, хандалтын лог |
| WAF | AWS Common, KnownBadInputs, IP Reputation; `/api/v1/auth/*`-д IP-ийн хурдны хязгаар. CSV оруулах тасрахгүйн тулд 8 KB body дүрмийг зөвхөн тоолно |
| Имэйл | SES: DKIM, өөрийн MAIL FROM (SPF), TLS заавал, bounce/complaint suppression |
| Хяналт | API 5xx, unhealthy task, RDS CPU/зай, **шифрлэлтийн бүрэн бүтэн байдлын зөрчил** → SNS (CMK) → имэйл |
| CI/CD | GitHub OIDC (урт хугацааны түлхүүргүй), action бүр commit SHA-аар түгжигдсэн, ECR скан HIGH/CRITICAL дээр зогсоно, infra apply хүний баталгаатай |

## Шалгагдсан ба шалгагдаагүй зүйлс

**Шалгагдсан:**
- `tofu validate` (AWS provider 6.71-ийн схемтэй) амжилттай давсан.
- `trivy config` 0 зөрчил илрүүлсэн. Хүлээн зөвшөөрсөн эрсдэлүүдийг доор тайлбарласан.
- `actionlint` болон `shellcheck` workflow, скриптүүдэд алдаа илрүүлээгүй.
- **MySQL 8.4.2 дээр:**
  - Бүх migration амжилттай ажилласан.
  - API-ийн 22 тест давсан.
  - `web.yml`-ийн дарааллаар 49 E2E шалгалт давсан.
  - `db-user.js` нууц үг солих болон хамгийн бага эрхийг баталгаажуулсан.

**Шалгагдаагүй:**
- AWS данс дээр `terraform plan/apply` ажиллуулаагүй.
- Docker image build хийгээгүй.
- SES-ээр бодит имэйл илгээгээгүй.

Эхний apply дээр гарах алдааг засах шаардлагатай байж болно.

## Урьдчилсан нөхцөл

- **AWS данс.** Группын данс бол өөрчлөлтийн зөвшөөрлийн урсгалаар явна.
- **Домэйн.** Route 53 hosted zone хэрэгтэй. Жишээ нь `bmms.example.mn` эсвэл түүний staging дэд домэйныг delegate хийсэн байх.
- **GitHub repo.** Нэг repo-д дараах бүтэцтэй байна: `bmms-api/`, `bmms-web/`, `bmms-infra/`. Энэ хавтсын `.github/`-ийг repo-ийн үндсэнд байрлуулна.
- **Локал хэрэгслүүд:** Terraform 1.10+ (эсвэл OpenTofu), AWS CLI v2, jq, openssl.

## Анхны байршуулалт

**1. Bootstrap (нэг удаа, локал state):**
```bash
cd bmms-infra/terraform/bootstrap
terraform init && terraform apply -var github_repo=your-org/bmms
```
Гаралтаас `state_bucket` болон `terraform_role_arn`-ийг тэмдэглэнэ.

**2. Staging дэд бүтэц:**
```bash
cd ../envs/staging
#  main.tf → backend "s3"-ийн bucket-ийг state_bucket болгоно
cp terraform.tfvars.example terraform.tfvars   # домэйн, zone, repo, имэйлээ бөглөнө (api_desired_count = 0)
terraform init && terraform apply              # CloudFront, RDS-ээс болж 20–30 минут
git add .terraform.lock.hcl                    # provider-ийн хувилбарыг түгжинэ
terraform output github_environment_variables
```

**3. GitHub тохиргоо (Settings → Environments):**

| Environment | Тохиргоо |
| --- | --- |
| `staging` | `github_environment_variables` гаралтын бүх утгыг **Variables**-д оруулна |
| `infra-staging-plan` | `AWS_REGION`, `AWS_TERRAFORM_ROLE_ARN`, `STAGING_TFVARS` (terraform.tfvars-ийн агуулга) |
| `infra-staging` | Дээрхтэй ижил утгууд. Нэмж **Required reviewers**-д мэдээллийн аюулгүй байдлын албаны хүнийг тохируулна |

`main` branch-д PR, review болон status check-ийг заавал болгоно.

**4. API-ийн нууцыг үүсгэх.** Утгууд дэлгэц, shell history, state-д үлдэхгүй:
```bash
AWS_REGION=ap-northeast-2 bmms-infra/scripts/init-secrets.sh "$(terraform output -raw app_secret_arn)"
```
**FIELD_KEYS-ийн нөөцийг AWS-ээс гадна хоёр хүний хяналттай газар хадгална.** Үүнийг алдвал ганцаарчилсан сургалтын мэдээлэл болон MFA-ийн нууц бүрмөсөн уншигдахгүй болно.

**5. Анхны deploy.** `main`-д push хийх эсвэл Actions → `api`, `web` → Run workflow. CI дараах алхмыг гүйцэтгэнэ:
1. Тест ажиллуулна.
2. Image build хийнэ.
3. ECR-ээр скан хийнэ.
4. `migrate` болон `dbuser` task-ыг ажиллуулна.
5. Service-ийг шинэчилж, `/api/*` smoke test хийнэ.

`api_desired_count = 0` үед smoke test-ийг алгасна.

**6. API-г асаах.** `terraform.tfvars`-д `api_desired_count = 1` болгоод `terraform apply` хийнэ. Task definition-ууд SSM-ээс сүүлд deploy хийсэн image-ийг уншина.

**7. Анхны admin.** Нууц үг огт дамжуулахгүй: санамсаргүй нууц үгтэй үүсгэж, тохируулах холбоосыг имэйлээр илгээнэ.
```bash
export ECS_CLUSTER=... TASK_SUBNETS=... TASK_SECURITY_GROUP=...   # github_environment_variables-аас
RUN_TASK_ENV="ADMIN_EMAIL=admin@example.mn" bmms-infra/scripts/run-task.sh bmms-staging-createadmin
```
Admin холбоосоор нууц үгээ тохируулж, анх нэвтрэхдээ MFA-аа тохируулна. Үлдсэн хэрэглэгчдийг интерфейсээс нэмнэ.

**8. SES.** Шинэ данс sandbox горимд байдаг тул зөвхөн баталгаажуулсан хаяг руу илгээнэ. Staging-д туршигчдын имэйлийг баталгаажуулна:
```bash
aws sesv2 create-email-identity --email-identity tester@example.mn
```
Pilot эхлэхээс өмнө SES → Account dashboard-оос production access хүсэлт гаргана. AWS хэд хоногт шийддэг.

**9. Аюулгүй байдлын шалгалт:**
- **SIEM-д холбох эх үүсвэрүүд:**
  - CloudWatch log group-ууд: `/ecs/bmms-staging/*`, `/vpc/bmms-staging/flow`, RDS error/slowquery.
  - CloudFront логийн bucket.
  - WAF-ийн хэмжүүрүүд.
  - DB-ийн `audit_log`. Үүнийг уншихын тулд `bmms_audit` role-той тусдаа DB хэрэглэгч үүсгэнэ.
- **Шалгалтын хүрээ:** Эмзэг байдлын скан болон pentest-ийг `https://<domain>` дээр хийнэ. ALB руу шууд хандвал 403 буцааж байгааг мөн шалгана.

## Өдөр тутмын ажиллагаа

| Ажил | Хэрхэн хийх |
| --- | --- |
| Код deploy хийх | `main` руу merge хийнэ. Workflow бүр зөвхөн өөрийн хавтсын өөрчлөлтөөр ажиллана |
| Дэд бүтэц өөрчлөх | PR (fmt, validate) → merge → plan → reviewer зөвшөөрнө → apply |
| DB нууц үг солих | Secrets Manager дахь `DB_PASSWORD`-ийг солиод `dbuser` task-ыг ажиллуулна (эсвэл дараагийн deploy). Дараа нь `aws ecs update-service --force-new-deployment` |
| JWT_SECRET солих | Secrets Manager-т солиод `--force-new-deployment` хийнэ. Бүх хэрэглэгч дахин нэвтэрнэ |
| Шифрлэлтийн түлхүүр солих | `FIELD_KEYS`-д шинэ түлхүүр **нэмж** `FIELD_KEY_ACTIVE`-ийг солино. Хуучин түлхүүрийг бүү устга |
| Нэг удаагийн task гараар ажиллуулах | Хуучин image-тэй байж болзошгүй тул эхлээд `register-image.sh <family> <image>` ажиллуулна |
| Устгах (staging) | `terraform destroy`. RDS-ийн эцсийн snapshot хадгалагдана |

## Хүлээн зөвшөөрсөн эрсдэл (trivy ignore)

| Шалгалт | Шалтгаан | Production-д |
| --- | --- | --- |
| AWS-0053 ALB нийтийн | SG нь зөвхөн CloudFront-ийн prefix list-ээс хандуулна. Listener нь нууц толгойгүй хүсэлтэд 403 буцаана | CloudFront VPC origin-оор ALB-г дотоод болгох |
| AWS-0104 Egress 443 → 0.0.0.0/0 | AWS API-ууд руу NAT-аар гарна | VPC interface endpoint-оор хязгаарлах |
| AWS-0176 IAM DB auth | Secrets Manager болон TLS заавал | Хэвээр |
| AWS-0177 Deletion protection | Staging-д унтраасан | `db_deletion_protection = true` |
| AWS-0132 Web/log bucket SSE-S3 | Статик файл; CloudFront лог SSE-KMS дэмждэггүй | Хэвээр |

## Зардал (ойролцоо, staging)

Сард ойролцоогоор **110–140 ам.доллар**. Гол зардлууд нь NAT Gateway (~40), ALB (~20), RDS db.t4g.micro (~20), WAF (~10), Fargate (~10) ба бусад. Нарийн дүнг AWS Pricing Calculator-аар бүсээ сонгож тооцоорой. Ажлын бус цагт `api_desired_count = 0` болгоход Fargate-ийн зардал л буурна.

## Production-д өөрчлөх

- **Өгөгдлийн сан:** `db_multi_az = true`, `db_deletion_protection = true`, тохиромжтой `db_instance_class`.
- **Сүлжээ:** `single_nat_gateway = false`.
- **API:** `api_desired_count = 2+`.
- **Хадгалалтын хугацаа:** `retention_years`-ийг хуулийн зөвлөгөөгөөр тогтооно.
- **Эрхүүд:** Infra role-ийн AdministratorAccess-ийг шаардлагатай үйлчилгээгээр хязгаарлана. Тусдаа AWS данс болон тусдаа `production` GitHub environment ашиглана.
- **Байршил:** Бодит хүүхдийн мэдээллийг аль бүсэд хадгалах шийдвэрийг хуулийн зөвлөгөөгөөр гаргана (одоогоор `ap-northeast-2`, Сөүл).
- **Repo платформ:** GitLab/Bitbucket ашиглавал workflow-уудыг тухайн CI-д шилжүүлж, OIDC trust-ийн `sub` нөхцөлийг өөрчилнө.
