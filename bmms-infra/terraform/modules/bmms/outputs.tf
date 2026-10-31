output "app_url" { value = local.app_url }
output "cloudfront_distribution_id" { value = aws_cloudfront_distribution.this.id }
output "web_bucket" { value = aws_s3_bucket.web.bucket }
output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
output "ecs_cluster" { value = aws_ecs_cluster.this.name }
output "ecs_service" { value = aws_ecs_service.api.name }
output "task_families" {
  value = {
    api         = aws_ecs_task_definition.api.family
    migrate     = aws_ecs_task_definition.migrate.family
    dbuser      = aws_ecs_task_definition.dbuser.family
    createadmin = aws_ecs_task_definition.createadmin.family
  }
}
output "private_subnet_ids" { value = aws_subnet.private[*].id }
output "task_security_group_id" { value = aws_security_group.api.id }
output "app_secret_arn" { value = aws_secretsmanager_secret.app.arn }
output "image_tag_parameter" { value = aws_ssm_parameter.image_tag.name }
output "deploy_role_arn" { value = aws_iam_role.deploy.arn }
output "rds_endpoint" { value = aws_db_instance.this.address }
output "alarm_topic_arn" { value = aws_sns_topic.alarms.arn }
