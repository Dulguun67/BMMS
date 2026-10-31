resource "aws_db_subnet_group" "this" {
  name       = local.prefix
  subnet_ids = aws_subnet.db[*].id
}

resource "aws_db_parameter_group" "this" {
  name_prefix = "${local.prefix}-mysql"
  family      = "mysql${var.db_engine_version}"
  description = "BMMS: triggers/functions, utf8mb4_0900_as_ci, TLS only"

  parameter {
    name  = "log_bin_trust_function_creators" # migration-ий function/trigger (master-т SUPER эрх байхгүй)
    value = "1"
  }
  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }
  parameter {
    name  = "collation_server" # Ё/Е, Ө/О-г ялгана
    value = "utf8mb4_0900_as_ci"
  }
  parameter {
    name  = "require_secure_transport"
    value = "1"
  }
  lifecycle { create_before_destroy = true }
}

# AWS-0176: IAM DB auth-ын оронд Secrets Manager + TLS заавал. AWS-0177: staging-д хувьсагчаар унтраасан, production-д true.
#trivy:ignore:AWS-0176
#trivy:ignore:AWS-0177
resource "aws_db_instance" "this" {
  identifier     = local.prefix
  engine         = "mysql"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.main.arn

  # Master нууц үгийг RDS өөрөө Secrets Manager-т үүсгэж, солино: Terraform state-д орохгүй
  username                      = "bmms_admin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.main.arn

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period   = var.db_backup_retention_days
  backup_window             = "17:00-18:00" # Улаанбаатарын 01:00–02:00
  maintenance_window        = "sun:18:30-sun:19:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.prefix}-final"

  auto_minor_version_upgrade      = true
  enabled_cloudwatch_logs_exports = ["error", "slowquery"]
  # Стандарт дэмжлэг дуусахад төлбөртэй Extended Support руу автоматаар орохоос сэргийлнэ
  engine_lifecycle_support = "open-source-rds-extended-support-disabled"
  apply_immediately        = !local.is_prod
}
