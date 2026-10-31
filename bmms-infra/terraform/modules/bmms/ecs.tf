resource "aws_ecs_cluster" "this" {
  name = local.prefix
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  for_each          = toset(["api", "migrate", "dbuser", "createadmin", "retention"])
  name              = "/ecs/${local.prefix}/${each.key}"
  retention_in_days = var.log_retention_days
}

# ---------------- IAM ----------------
data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.this.account_id]
    }
  }
}

# Execution role: image татах, лог бичих, нууцыг уншиж контейнерт дамжуулах
resource "aws_iam_role" "execution" {
  name               = "${local.prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${data.aws_partition.this.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"],
      Resource = [aws_secretsmanager_secret.app.arn, aws_db_instance.this.master_user_secret[0].secret_arn] },
      { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [aws_kms_key.main.arn] },
    ]
  })
}

# API task role: зөвхөн SES-ээр имэйл илгээх. ECS Exec (контейнер руу shell) ашиглахгүй: анхны admin-ийг
# createadmin task-аар нууц үг дамжуулалгүй үүсгэнэ, root файлын систем нь зөвхөн уншигдах горимтой.
resource "aws_iam_role" "api" {
  name               = "${local.prefix}-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}
resource "aws_iam_role_policy" "api" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ses:SendEmail"],
      Resource = [aws_sesv2_email_identity.domain.arn, aws_sesv2_configuration_set.this.arn] },
    ]
  })
}

# ---------------- Task definition ----------------
locals {
  image      = "${aws_ecr_repository.api.repository_url}:${nonsensitive(data.aws_ssm_parameter.image_tag.value)}"
  secret_arn = aws_secretsmanager_secret.app.arn
  master_arn = aws_db_instance.this.master_user_secret[0].secret_arn
  db_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "DB_HOST", value = aws_db_instance.this.address },
    { name = "DB_PORT", value = tostring(aws_db_instance.this.port) },
    { name = "DB_NAME", value = "bmms" },
    { name = "DB_SSL_CA", value = "/app/certs/rds-global-bundle.pem" },
  ]
  api_env = concat(local.db_env, [
    { name = "PORT", value = "8080" },
    { name = "TRUST_PROXY", value = "2" }, # CloudFront + ALB: rate limit жинхэнэ client IP-гаар
    { name = "DB_USER", value = "bmms_api" },
    { name = "CORS_ORIGINS", value = local.app_url },
    { name = "COOKIE_SECURE", value = "true" },
    { name = "APP_URL", value = local.app_url },
    { name = "MAIL_PROVIDER", value = "ses" },
    { name = "MAIL_FROM", value = local.mail_from },
    { name = "AWS_REGION", value = var.region },
    { name = "SES_CONFIGURATION_SET", value = aws_sesv2_configuration_set.this.configuration_set_name },
    { name = "MFA_REQUIRED_ROLES", value = var.mfa_required_roles },
    { name = "LOG_LEVEL", value = "info" },
  ])
  api_secrets = [for k in ["DB_PASSWORD", "JWT_SECRET", "FIELD_KEYS", "FIELD_KEY_ACTIVE", "MFA_PEPPER"] :
  { name = k, valueFrom = "${local.secret_arn}:${k}::" }]
  master_secrets = [
    { name = "MIGRATE_DB_USER", valueFrom = "${local.master_arn}:username::" },
    { name = "MIGRATE_DB_PASSWORD", valueFrom = "${local.master_arn}:password::" },
  ]
  log = { for k in ["api", "migrate", "dbuser", "createadmin", "retention"] : k => {
    logDriver = "awslogs"
    options   = { "awslogs-group" = aws_cloudwatch_log_group.ecs[k].name, "awslogs-region" = var.region, "awslogs-stream-prefix" = k }
  } }
  base_container = {
    image                  = local.image
    essential              = true
    readonlyRootFilesystem = true
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([merge(local.base_container, {
    name             = "api"
    portMappings     = [{ containerPort = 8080, protocol = "tcp" }]
    environment      = local.api_env
    secrets          = local.api_secrets
    logConfiguration = local.log["api"]
    healthCheck = {
      command  = ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/health || exit 1"]
      interval = 30, timeout = 5, retries = 3, startPeriod = 20
    }
  })])
}

# Нэг удаагийн task-ууд: migration (deploy бүрийн өмнө), API-ийн DB хэрэглэгч үүсгэх/нууц үг солих
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([merge(local.base_container, {
    name             = "migrate"
    command          = ["node", "scripts/migrate.js"]
    environment      = local.db_env
    secrets          = local.master_secrets
    logConfiguration = local.log["migrate"]
  })])
}

resource "aws_ecs_task_definition" "dbuser" {
  family                   = "${local.prefix}-dbuser"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([merge(local.base_container, {
    name             = "dbuser"
    command          = ["node", "scripts/db-user.js"]
    environment      = concat(local.db_env, [{ name = "APP_DB_USER", value = "bmms_api" }])
    secrets          = concat(local.master_secrets, [{ name = "APP_DB_PASSWORD", valueFrom = "${local.secret_arn}:DB_PASSWORD::" }])
    logConfiguration = local.log["dbuser"]
  })])
}

# Анхны admin: санамсаргүй нууц үгтэй үүсгэж, нууц үг тохируулах холбоосыг имэйлээр илгээнэ.
#   RUN_TASK_ENV="ADMIN_EMAIL=admin@example.mn" scripts/run-task.sh <family>
resource "aws_ecs_task_definition" "createadmin" {
  family                   = "${local.prefix}-createadmin"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.api.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([merge(local.base_container, {
    name             = "createadmin"
    command          = ["node", "scripts/create-user.js", "--send-reset"]
    environment      = local.api_env
    secrets          = local.api_secrets
    logConfiguration = local.log["createadmin"]
  })])
}

resource "aws_ecs_task_definition" "retention" {
  count                    = var.retention_years == null ? 0 : 1
  family                   = "${local.prefix}-retention"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([merge(local.base_container, {
    name             = "retention"
    command          = ["node", "scripts/retention.js", "--apply"]
    environment      = concat(local.api_env, [{ name = "RETENTION_YEARS", value = tostring(var.retention_years) }])
    secrets          = local.api_secrets
    logConfiguration = local.log["retention"]
  })])
}

# ---------------- API service ----------------
resource "aws_ecs_service" "api" {
  name                   = "api"
  cluster                = aws_ecs_cluster.this.id
  task_definition        = aws_ecs_task_definition.api.arn
  desired_count          = var.api_desired_count
  launch_type            = "FARGATE"
  platform_version       = "LATEST"
  enable_execute_command = false
  propagate_tags         = "SERVICE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8080
  }
  health_check_grace_period_seconds = 60
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  # CI шинэ revision бүртгэж deploy хийнэ; Terraform буцааж дарахгүй
  lifecycle { ignore_changes = [task_definition] }
  depends_on = [aws_lb_listener.https]
}

# ---------------- Хадгалалтын хугацааны өдөр тутмын task ----------------
resource "aws_iam_role" "scheduler" {
  count = var.retention_years == null ? 0 : 1
  name  = "${local.prefix}-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole",
    Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.this.account_id } } }]
  })
}
resource "aws_iam_role_policy" "scheduler" {
  count = var.retention_years == null ? 0 : 1
  role  = aws_iam_role.scheduler[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecs:RunTask"], Resource = ["${aws_ecs_task_definition.retention[0].arn_without_revision}:*"] },
      { Effect = "Allow", Action = ["iam:PassRole"], Resource = [aws_iam_role.execution.arn] },
    ]
  })
}
resource "aws_scheduler_schedule" "retention" {
  count                        = var.retention_years == null ? 0 : 1
  name                         = "${local.prefix}-retention"
  schedule_expression          = "cron(0 19 * * ? *)" # Улаанбаатарын 03:00
  schedule_expression_timezone = "UTC"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_ecs_cluster.this.arn
    role_arn = aws_iam_role.scheduler[0].arn
    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.retention[0].arn_without_revision
      launch_type         = "FARGATE"
      network_configuration {
        subnets          = aws_subnet.private[*].id
        security_groups  = [aws_security_group.api.id]
        assign_public_ip = false
      }
    }
  }
}
