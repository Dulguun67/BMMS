# CloudFront-ийн WAF (us-east-1). AWS-ийн удирддаг дүрэм + нэвтрэлтийн замд IP-ийн хурдны хязгаар
locals {
  managed_rules = [
    { name = "AWSManagedRulesCommonRuleSet", priority = 1 },
    { name = "AWSManagedRulesKnownBadInputsRuleSet", priority = 2 },
    { name = "AWSManagedRulesAmazonIpReputationList", priority = 3 },
  ]
}

resource "aws_wafv2_web_acl" "cdn" {
  provider = aws.us_east_1
  name     = local.prefix
  scope    = "CLOUDFRONT"
  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.managed_rules
    content {
      name     = rule.value.name
      priority = rule.value.priority
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value.name
          # CommonRuleSet 8 KB-аас том body-г блоклодог: CSV оруулах (300 мөр JSON) тасрахгүйн тулд зөвхөн тоолно
          dynamic "rule_action_override" {
            for_each = rule.value.name == "AWSManagedRulesCommonRuleSet" ? ["SizeRestrictions_BODY"] : []
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        sampled_requests_enabled   = true
        metric_name                = "${local.prefix}-${rule.value.name}"
      }
    }
  }

  rule {
    name     = "auth-rate-limit"
    priority = 10
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = var.waf_auth_rate_limit
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/v1/auth/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "${local.prefix}-auth-rate-limit"
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    sampled_requests_enabled   = true
    metric_name                = local.prefix
  }
}
