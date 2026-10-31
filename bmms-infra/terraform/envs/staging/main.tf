terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # bootstrap-ийн гаралтаас bucket нэрийг оруулна. use_lockfile: S3-ийн өөрийн түгжээ (DynamoDB шаардлагагүй)
  backend "s3" {
    bucket       = "CHANGE-ME-bmms-tfstate"
    key          = "staging/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}

locals {
  tags = { Project = "bmms", Environment = "staging", ManagedBy = "terraform", DataClass = "demo-only" }
}

provider "aws" {
  region = var.region
  default_tags { tags = local.tags }
}
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags { tags = local.tags }
}

module "bmms" {
  source    = "../../modules/bmms"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  env             = "staging"
  region          = var.region
  domain          = var.domain
  origin_domain   = var.origin_domain
  mail_domain     = var.mail_domain
  route53_zone_id = var.route53_zone_id
  github_repo     = var.github_repo
  alarm_email     = var.alarm_email

  # Staging: зардал хэмнэсэн тохиргоо
  single_nat_gateway     = true
  db_instance_class      = "db.t4g.micro"
  db_multi_az            = false
  db_deletion_protection = false
  api_desired_count      = var.api_desired_count
  retention_years        = null # хуулийн зөвлөгөөгөөр тогтоосны дараа
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}
variable "domain" { type = string }
variable "origin_domain" { type = string }
variable "mail_domain" { type = string }
variable "route53_zone_id" { type = string }
variable "github_repo" { type = string }
variable "alarm_email" {
  type    = string
  default = ""
}
variable "api_desired_count" {
  type    = number
  default = 0
}

output "app_url" { value = module.bmms.app_url }
output "github_environment_variables" {
  description = "GitHub → Settings → Environments → staging → Variables-д хуулна"
  value = {
    AWS_REGION          = var.region
    APP_URL             = module.bmms.app_url
    AWS_DEPLOY_ROLE_ARN = module.bmms.deploy_role_arn
    ECR_REPOSITORY_URL  = module.bmms.ecr_repository_url
    ECS_CLUSTER         = module.bmms.ecs_cluster
    ECS_SERVICE         = module.bmms.ecs_service
    TASK_FAMILY_API     = module.bmms.task_families.api
    TASK_FAMILY_MIGRATE = module.bmms.task_families.migrate
    TASK_FAMILY_DBUSER  = module.bmms.task_families.dbuser
    TASK_SUBNETS        = join(",", module.bmms.private_subnet_ids)
    TASK_SECURITY_GROUP = module.bmms.task_security_group_id
    IMAGE_TAG_PARAMETER = module.bmms.image_tag_parameter
    WEB_BUCKET          = module.bmms.web_bucket
    CF_DISTRIBUTION_ID  = module.bmms.cloudfront_distribution_id
  }
}
output "app_secret_arn" { value = module.bmms.app_secret_arn }
