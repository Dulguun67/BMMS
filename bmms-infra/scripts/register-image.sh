#!/usr/bin/env bash
# Task definition-ий одоогийн revision-ыг шинэ image-тэй хуулж бүртгэнэ, шинэ ARN-ийг хэвлэнэ.
#   ./register-image.sh <family> <image-uri>
set -euo pipefail
FAMILY="${1:?family}"; IMAGE="${2:?image}"
aws ecs describe-task-definition --task-definition "$FAMILY" --query taskDefinition --output json \
  | jq --arg img "$IMAGE" '.containerDefinitions |= map(.image = $img)
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
            .registeredAt, .registeredBy, .deregisteredAt)' > /tmp/td-$$.json
aws ecs register-task-definition --cli-input-json "file:///tmp/td-$$.json" \
  --query taskDefinition.taskDefinitionArn --output text
rm -f /tmp/td-$$.json
