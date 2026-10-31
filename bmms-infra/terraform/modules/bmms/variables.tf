variable "name" {
  type    = string
  default = "bmms"
}
variable "env" {
  type        = string
  description = "staging | production"
}
variable "region" { type = string }

# ---- Домэйн ----
variable "domain" {
  type        = string
  description = "Хэрэглэгчийн нэвтрэх хаяг (CloudFront), жишээ нь staging.bmms.example.mn"
}
variable "origin_domain" {
  type        = string
  description = "ALB-ийн дотоод хаяг (зөвхөн CloudFront ханддаг), жишээ нь origin.staging.bmms.example.mn"
}
variable "route53_zone_id" {
  type        = string
  description = "domain, origin_domain, mail_domain-ийн Route 53 hosted zone"
}
variable "mail_domain" {
  type        = string
  description = "Имэйл илгээх домэйн (SES), жишээ нь staging.bmms.example.mn"
}
variable "mail_from_local_part" {
  type    = string
  default = "no-reply"
}
variable "create_dmarc_record" {
  type    = bool
  default = false
}
variable "dmarc_rua" {
  type    = string
  default = ""
}

# ---- Сүлжээ ----
variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}
variable "az_count" {
  type    = number
  default = 2
}
variable "single_nat_gateway" {
  type        = bool
  default     = true
  description = "Staging-д зардал хэмнэх; production-д false (AZ бүрд NAT)"
}

# ---- Өгөгдлийн сан ----
variable "db_engine_version" {
  type        = string
  default     = "8.4"
  description = "RDS for MySQL 8.0-ийн стандарт дэмжлэг 2026-07-31-нд дууссан тул 8.4 (LTS)"
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "db_allocated_storage" {
  type    = number
  default = 20
}
variable "db_max_allocated_storage" {
  type    = number
  default = 100
}
variable "db_multi_az" {
  type    = bool
  default = false
}
variable "db_backup_retention_days" {
  type    = number
  default = 7
}
variable "db_deletion_protection" {
  type    = bool
  default = true
}

# ---- API ----
variable "api_cpu" {
  type    = number
  default = 256
}
variable "api_memory" {
  type    = number
  default = 512
}
variable "api_desired_count" {
  type        = number
  default     = 0
  description = "Анхны apply-д 0: image, нууц, migration бэлэн болсны дараа 1+ болгоно"
}
variable "mfa_required_roles" {
  type    = string
  default = "arga_zuich,admin"
}
variable "retention_years" {
  type        = number
  default     = null
  description = "Хадгалалтын хугацаа (жил). null бол өдөр тутмын устгах task үүсэхгүй (хуулийн зөвлөгөөгөөр тогтооно)"
}
variable "log_retention_days" {
  type    = number
  default = 90
}

# ---- Хамгаалалт, хяналт ----
variable "waf_auth_rate_limit" {
  type        = number
  default     = 100
  description = "IP тус бүрээс /api/v1/auth/* руу 5 минутад зөвшөөрөх хүсэлт"
}
variable "cloudfront_price_class" {
  type    = string
  default = "PriceClass_200"
}
variable "alarm_email" {
  type    = string
  default = ""
}

# ---- CI/CD (GitHub Actions OIDC) ----
variable "github_repo" {
  type        = string
  description = "owner/repo"
}
variable "github_environment" {
  type    = string
  default = "staging"
}
