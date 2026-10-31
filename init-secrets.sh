#!/usr/bin/env bash
# API-ийн нууцыг (DB_PASSWORD, JWT_SECRET, FIELD_KEYS, FIELD_KEY_ACTIVE, MFA_PEPPER) нэг удаа үүсгэж
# Secrets Manager-т шууд бичнэ. Утгууд дэлгэц, shell history, Terraform state-д үлдэхгүй.
#   AWS_REGION=ap-northeast-2 ./init-secrets.sh <app_secret_arn>
# Аль хэдийн утгатай бол зогсоно: FIELD_KEYS-ийг дарж бичвэл ганцаарчилсан сургалтын шифрлэгдсэн
# мэдээлэл бүрмөсөн уншигдахгүй болно.
set -euo pipefail
SECRET_ID="${1:?Хэрэглээ: init-secrets.sh <app_secret_arn>}"
: "${AWS_REGION:?AWS_REGION заана уу}"

if aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --region "$AWS_REGION" --query VersionId --output text >/dev/null 2>&1; then
  echo "Нууц аль хэдийн утгатай байна. FIELD_KEYS алдагдахаас сэргийлж зогслоо." >&2
  echo "DB нууц үг эсвэл JWT_SECRET солих бол README-ийн 'Нууц солих' хэсгийг үзнэ үү." >&2
  exit 1
fi

umask 077
tmp="$(mktemp)"
trap 'shred -u "$tmp" 2>/dev/null || rm -f "$tmp"' EXIT

gen_secret_json() {
  local key_id db jwt pepper field
  key_id="k$(date -u +%Y%m)"
  db="$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 40)"
  jwt="$(openssl rand -hex 32)"
  pepper="$(openssl rand -hex 32)"
  field="$(openssl rand -base64 32)"
  # FIELD_KEYS нь JSON мөр тул дотор нь хашилтыг escape хийнэ
  printf '{"DB_PASSWORD":"%s","JWT_SECRET":"%s","FIELD_KEYS":"{\\"%s\\":\\"%s\\"}","FIELD_KEY_ACTIVE":"%s","MFA_PEPPER":"%s"}' \
    "$db" "$jwt" "$key_id" "$field" "$key_id" "$pepper"
}

if [ "${INIT_SECRETS_SELFTEST:-}" = "1" ]; then gen_secret_json; exit 0; fi

gen_secret_json > "$tmp"
aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --region "$AWS_REGION" \
  --secret-string "file://$tmp" --query VersionId --output text >/dev/null
echo "Нууц бичигдлээ: $SECRET_ID"
cat <<'MSG'

ЗААВАЛ: FIELD_KEYS-ийн нөөцийг AWS-ээс гадна, хоёр хүний хяналттай газар (жишээ нь байгууллагын
нууц үгийн сан эсвэл битүүмжилсэн цаасан хуулбар) хадгална. Үүнийг алдвал ганцаарчилсан сургалтын
шифрлэгдсэн мэдээллийг сэргээх боломжгүй. Уншихдаа:
  aws secretsmanager get-secret-value --secret-id <arn> --query SecretString --output text | jq -r .FIELD_KEYS
MSG
