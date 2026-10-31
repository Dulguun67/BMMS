#!/usr/bin/env bash
# БММС frontend-ийг S3 + CloudFront руу байршуулах.
#   BUCKET=bmms-web-prod DISTRIBUTION_ID=E123ABC ./deploy/deploy.sh
set -euo pipefail
: "${BUCKET:?BUCKET заана уу}"
: "${DISTRIBUTION_ID:?DISTRIBUTION_ID заана уу}"

npm ci
npm run build

# Нэр нь hash-тай тул удаан кэшлэнэ
aws s3 sync dist/assets "s3://${BUCKET}/assets" --cache-control "public,max-age=31536000,immutable" --delete
# index.html болон бусад файлыг үргэлж шинээр шалгуулна
aws s3 sync dist "s3://${BUCKET}" --exclude "assets/*" --cache-control "no-cache" --delete
aws cloudfront create-invalidation --distribution-id "${DISTRIBUTION_ID}" --paths "/" "/index.html" >/dev/null
echo "Байршуулалт дууслаа."
