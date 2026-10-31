#!/usr/bin/env bash
# Нэг удаагийн ECS task (migration, DB хэрэглэгч) ажиллуулж дуустал хүлээнэ, логийг хэвлэнэ.
#   ECS_CLUSTER=... TASK_SUBNETS=subnet-a,subnet-b TASK_SECURITY_GROUP=sg-... ./run-task.sh <task-def-arn|family>
# Exit code нь контейнерийн exit code-оос хамаарна (CI алдаатай migration дээр зогсоно).
# Нэмэлт орчны хувьсагч: RUN_TASK_ENV="KEY=value,KEY2=value2" (жишээ нь ADMIN_EMAIL=...)
set -euo pipefail
TD="${1:?task definition}"
: "${ECS_CLUSTER:?}" "${TASK_SUBNETS:?}" "${TASK_SECURITY_GROUP:?}"

OVERRIDES='{}'
if [ -n "${RUN_TASK_ENV:-}" ]; then
  CONTAINER_NAME="$(aws ecs describe-task-definition --task-definition "$TD" --query 'taskDefinition.containerDefinitions[0].name' --output text)"
  OVERRIDES="$(jq -cn --arg name "$CONTAINER_NAME" --arg env "$RUN_TASK_ENV" \
    '{containerOverrides: [{name: $name, environment: ($env | split(",") | map(capture("^(?<name>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$")))}]}')"
fi

TASK_ARN="$(aws ecs run-task --cluster "$ECS_CLUSTER" --task-definition "$TD" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${TASK_SUBNETS}],securityGroups=[${TASK_SECURITY_GROUP}],assignPublicIp=DISABLED}" \
  --overrides "$OVERRIDES" --started-by "${GITHUB_RUN_ID:-manual}" --query 'tasks[0].taskArn' --output text)"
if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" = "None" ]; then echo "Task эхлүүлж чадсангүй" >&2; exit 1; fi
echo "Task: $TASK_ARN"
aws ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN"

read -r EXIT_CODE CONTAINER <<<"$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].[exitCode,name]' --output text)"
TD_ARN="$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].taskDefinitionArn' --output text)"
read -r GROUP PREFIX <<<"$(aws ecs describe-task-definition --task-definition "$TD_ARN" \
  --query 'taskDefinition.containerDefinitions[0].logConfiguration.options.["awslogs-group","awslogs-stream-prefix"]' --output text)"
echo "---- лог ----"
aws logs get-log-events --log-group-name "$GROUP" --log-stream-name "${PREFIX}/${CONTAINER}/${TASK_ARN##*/}" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' | tail -n 60 || true
echo "-------------"
if [ "$EXIT_CODE" != "0" ]; then
  echo "Task амжилтгүй (exit=$EXIT_CODE): $(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK_ARN" --query 'tasks[0].stoppedReason' --output text)" >&2
  exit 1
fi
