resource "aws_sns_topic" "alarms" {
  name              = "${local.prefix}-alarms"
  kms_master_key_id = aws_kms_key.main.arn
}
resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  alb_dims = { LoadBalancer = aws_lb.api.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
  alarms = {
    api-5xx = { ns = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum", op = "GreaterThanThreshold", th = 10, dims = local.alb_dims,
    desc = "API 5 минутад 10-аас олон 5xx алдаа" }
    api-unhealthy = { ns = "AWS/ApplicationELB", metric = "UnHealthyHostCount", stat = "Maximum", op = "GreaterThanThreshold", th = 0, dims = local.alb_dims,
    desc = "API task /ready шалгалтад унасан (DB холболт?)" }
    db-cpu = { ns = "AWS/RDS", metric = "CPUUtilization", stat = "Average", op = "GreaterThanThreshold", th = 80, dims = { DBInstanceIdentifier = aws_db_instance.this.identifier },
    desc = "RDS CPU 80%-аас дээш" }
    db-storage = { ns = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum", op = "LessThanThreshold", th = 2147483648, dims = { DBInstanceIdentifier = aws_db_instance.this.identifier },
    desc = "RDS сул зай 2 GB-аас бага" }
  }
}
resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${local.prefix}-${each.key}"
  alarm_description   = each.value.desc
  namespace           = each.value.ns
  metric_name         = each.value.metric
  statistic           = each.value.stat
  comparison_operator = each.value.op
  threshold           = each.value.th
  dimensions          = each.value.dims
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# Аюулгүй байдлын үйл явдал: шифрлэгдсэн өгөгдлийн бүрэн бүтэн байдал алдагдсан (API логийн мөр)
resource "aws_cloudwatch_log_metric_filter" "integrity" {
  name           = "${local.prefix}-integrity"
  log_group_name = aws_cloudwatch_log_group.ecs["api"].name
  pattern        = "{ $.msg = \"security: data integrity failure\" }"
  metric_transformation {
    name      = "IntegrityFailures"
    namespace = "BMMS/${var.env}"
    value     = "1"
  }
}
resource "aws_cloudwatch_metric_alarm" "integrity" {
  alarm_name          = "${local.prefix}-integrity"
  alarm_description   = "Шифрлэгдсэн өгөгдөл эвдэрсэн эсвэл өөр мөрөнд хуулагдсан: аюулгүй байдлын зөрчил байж болзошгүй"
  namespace           = "BMMS/${var.env}"
  metric_name         = "IntegrityFailures"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
