locals {
  prefix    = "${var.name}-${var.env}"
  azs       = slice(data.aws_availability_zones.this.names, 0, var.az_count)
  is_prod   = var.env == "production"
  app_url   = "https://${var.domain}"
  mail_from = "БММС <${var.mail_from_local_part}@${var.mail_domain}>"
}

data "aws_availability_zones" "this" {
  state = "available"
}
data "aws_caller_identity" "this" {}
data "aws_partition" "this" {}

# Бүх өгөгдлийг шифрлэх нэг CMK (RDS, Secrets Manager); жил бүр автоматаар солигдоно
resource "aws_kms_key" "main" {
  description             = "${local.prefix} RDS, Secrets Manager, ECR, SNS"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "AccountAdmin", Effect = "Allow", Action = "kms:*", Resource = "*",
      Principal = { AWS = "arn:${data.aws_partition.this.partition}:iam::${data.aws_caller_identity.this.account_id}:root" } },
      # CloudWatch alarm шифрлэгдсэн SNS topic руу нийтлэхэд шаардлагатай (AWS-managed aws/sns түлхүүрээр ажиллахгүй)
      { Sid       = "CloudWatchAlarmsToSns", Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey*"], Resource = "*",
        Principal = { Service = "cloudwatch.amazonaws.com" },
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.this.account_id } } },
    ]
  })
}
resource "aws_kms_alias" "main" {
  name          = "alias/${local.prefix}"
  target_key_id = aws_kms_key.main.key_id
}
