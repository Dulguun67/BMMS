# API-ийн нууц: зөвхөн "сав"-ыг энд үүсгэнэ. Утгыг scripts/init-secrets.sh-ээр гаднаас оруулна,
# тиймээс JWT_SECRET, FIELD_KEYS, MFA_PEPPER, DB_PASSWORD Terraform state-д хэзээ ч орохгүй.
resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.name}/${var.env}/app"
  description             = "BMMS API: DB_PASSWORD, JWT_SECRET, FIELD_KEYS, FIELD_KEY_ACTIVE, MFA_PEPPER"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = 30
}

# CloudFront → ALB нууц толгой: ALB-д шууд хандахыг хаана (энэ утга state-д байна, эмзэг биш)
resource "random_password" "origin_verify" {
  length  = 48
  special = false
}

# Одоо ажиллаж буй API image-ийн tag: CI deploy бүрд шинэчилнэ, Terraform уншина (task definition-ууд зөрөхгүй)
resource "aws_ssm_parameter" "image_tag" {
  name  = "/${var.name}/${var.env}/api_image_tag"
  type  = "String"
  value = "bootstrap"
  lifecycle { ignore_changes = [value] }
}
data "aws_ssm_parameter" "image_tag" {
  name       = aws_ssm_parameter.image_tag.name
  depends_on = [aws_ssm_parameter.image_tag]
}
