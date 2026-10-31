# ALB-ийн гэрчилгээ (бүсийн) ба CloudFront-ийн гэрчилгээ (us-east-1), DNS баталгаажуулалттай
resource "aws_acm_certificate" "origin" {
  domain_name       = var.origin_domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_acm_certificate" "cdn" {
  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

locals {
  cert_validations = merge(
    { for o in aws_acm_certificate.origin.domain_validation_options : "origin-${o.domain_name}" => o },
    { for o in aws_acm_certificate.cdn.domain_validation_options : "cdn-${o.domain_name}" => o },
  )
}
resource "aws_route53_record" "cert_validation" {
  for_each        = local.cert_validations
  zone_id         = var.route53_zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}
resource "aws_acm_certificate_validation" "origin" {
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [for k, r in aws_route53_record.cert_validation : r.fqdn if startswith(k, "origin-")]
}
resource "aws_acm_certificate_validation" "cdn" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [for k, r in aws_route53_record.cert_validation : r.fqdn if startswith(k, "cdn-")]
}

resource "aws_route53_record" "origin" {
  zone_id = var.route53_zone_id
  name    = var.origin_domain
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
resource "aws_route53_record" "app" {
  for_each = toset(["A", "AAAA"])
  zone_id  = var.route53_zone_id
  name     = var.domain
  type     = each.key
  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
