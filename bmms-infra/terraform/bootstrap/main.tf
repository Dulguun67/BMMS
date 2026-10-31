# Нэг удаа, local state-тэй ажиллуулна: Terraform state-ийн bucket, GitHub OIDC provider, infra pipeline-ий role.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region = var.region
  default_tags { tags = { Project = "bmms", ManagedBy = "terraform-bootstrap" } }
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}
variable "github_repo" {
  type        = string
  description = "owner/repo"
}
variable "create_github_oidc_provider" {
  type        = bool
  default     = true
  description = "Данс дээр аль хэдийн байвал false"
}

data "aws_caller_identity" "this" {}

resource "aws_s3_bucket" "state" {
  bucket_prefix = "bmms-tfstate-"
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
# State-д нууц биш боловч эмзэг утга (ALB-ийн нууц толгой, дэд бүтцийн бүтэц) байдаг тул өөрийн KMS түлхүүр
resource "aws_kms_key" "state" {
  description             = "BMMS Terraform state"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Sid = "DenyInsecureTransport", Effect = "Deny", Principal = "*", Action = "s3:*",
      Resource = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"],
    Condition = { Bool = { "aws:SecureTransport" = "false" } } }]
  })
  depends_on = [aws_s3_bucket_public_access_block.state]
}
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
data "aws_iam_openid_connect_provider" "github" {
  url        = "https://token.actions.githubusercontent.com"
  depends_on = [aws_iam_openid_connect_provider.github]
}

# Infra pipeline: plan (шалгалтгүй) ба apply (хүний баталгаатай) хоёр GitHub environment
resource "aws_iam_role" "terraform" {
  name = "bmms-staging-terraform"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike = { "token.actions.githubusercontent.com:sub" = [
          "repo:${var.github_repo}:environment:infra-staging-plan",
          "repo:${var.github_repo}:environment:infra-staging",
        ] }
      }
    }]
  })
}
# Staging-д хялбар байлгах үүднээс AdministratorAccess. Production-д зөвхөн шаардлагатай үйлчилгээгээр хязгаарлана.
resource "aws_iam_role_policy_attachment" "terraform" {
  role       = aws_iam_role.terraform.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "state_bucket" { value = aws_s3_bucket.state.bucket }
output "state_kms_key_arn" { value = aws_kms_key.state.arn }
output "terraform_role_arn" { value = aws_iam_role.terraform.arn }
