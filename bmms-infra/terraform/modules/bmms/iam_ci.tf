# GitHub Actions (OIDC): урт хугацааны access key хадгалахгүй. Зөвхөн тухайн repo-ийн тухайн environment.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "deploy" {
  name = "${local.prefix}-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:environment:${var.github_environment}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrLogin", Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Sid = "EcrPush", Effect = "Allow", Resource = aws_ecr_repository.api.arn, Action = [
        "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload",
      "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages", "ecr:DescribeImageScanFindings"] },
      { Sid = "KmsForEcr", Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey"], Resource = aws_kms_key.main.arn },
      { Sid = "TaskDefs", Effect = "Allow", Action = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"], Resource = "*" },
      { Sid = "Deploy", Effect = "Allow", Action = ["ecs:UpdateService", "ecs:DescribeServices"], Resource = aws_ecs_service.api.id },
      { Sid = "RunJobs", Effect = "Allow", Action = ["ecs:RunTask"], Resource = [
        "arn:${data.aws_partition.this.partition}:ecs:${var.region}:${data.aws_caller_identity.this.account_id}:task-definition/${local.prefix}-migrate:*",
        "arn:${data.aws_partition.this.partition}:ecs:${var.region}:${data.aws_caller_identity.this.account_id}:task-definition/${local.prefix}-dbuser:*"],
      Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.this.arn } } },
      { Sid = "WatchJobs", Effect = "Allow", Action = ["ecs:DescribeTasks"], Resource = "*" },
      { Sid = "PassRoles", Effect = "Allow", Action = ["iam:PassRole"], Resource = [aws_iam_role.execution.arn, aws_iam_role.api.arn],
      Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } } },
      { Sid = "JobLogs", Effect = "Allow", Action = ["logs:GetLogEvents"], Resource = [
      "${aws_cloudwatch_log_group.ecs["migrate"].arn}:*", "${aws_cloudwatch_log_group.ecs["dbuser"].arn}:*"] },
      { Sid = "ImageTag", Effect = "Allow", Action = ["ssm:PutParameter", "ssm:GetParameter"], Resource = aws_ssm_parameter.image_tag.arn },
      { Sid = "WebSync", Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.web.arn },
      { Sid = "WebObjects", Effect = "Allow", Action = ["s3:PutObject", "s3:DeleteObject", "s3:GetObject"], Resource = "${aws_s3_bucket.web.arn}/*" },
      { Sid = "Invalidate", Effect = "Allow", Action = ["cloudfront:CreateInvalidation"], Resource = aws_cloudfront_distribution.this.arn },
    ]
  })
}
