# Хүлээн зөвшөөрсөн эрсдэл: ALB нийтийн боловч SG нь зөвхөн CloudFront-ийн prefix list-ээс, listener нь
# нууц X-Origin-Verify толгойгүй хүсэлтийг 403-аар татгалзана. Production-д CloudFront VPC origin-ийг авч үзнэ.
#trivy:ignore:AWS-0053
resource "aws_lb" "api" {
  name                       = local.prefix
  load_balancer_type         = "application"
  internal                   = false # CloudFront-ийн origin; SG нь зөвхөн CloudFront-оос
  security_groups            = [aws_security_group.alb.id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
  enable_deletion_protection = local.is_prod
}

resource "aws_lb_target_group" "api" {
  name                 = "${local.prefix}-api"
  port                 = 8080
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 30
  health_check {
    path                = "/ready"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.origin.certificate_arn
  # CloudFront-ын нууц толгойгүй хүсэлтийг татгалзана
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "from_cloudfront" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }
}
