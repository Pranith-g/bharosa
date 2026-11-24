#!/usr/bin/env bash
# Build the image, push it to ECR and deploy the CloudFormation stack (ECS Express Mode + DynamoDB).
# Usage: AWS_REGION=ap-south-1 ./deploy/aws/deploy.sh [stack-name]
set -euo pipefail
# Extra CloudFormation parameters can follow the stack name, e.g. CallChannel=elevenlabs ElevenLabsApiKey=...
STACK="${1:-bharosa}"; shift || true
EXTRA=("$@")
REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
REPO="bharosa"
TAG="$(date +%Y%m%d%H%M%S)"
IMAGE="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:$TAG"
cd "$(dirname "$0")/../.."

aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "$REPO" --region "$REGION" >/dev/null
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"

deploy() {
  aws cloudformation deploy --region "$REGION" --stack-name "$STACK" \
    --template-file deploy/aws/template.yaml --capabilities CAPABILITY_IAM \
    --parameter-overrides ImageUri="$IMAGE" ${EXTRA[@]+"${EXTRA[@]}"} "$@"
}
deploy BaseUrl="${BHAROSA_BASE_URL:-}"
ENDPOINT="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='Endpoint'].OutputValue" --output text)"
case "$ENDPOINT" in http*) URL="$ENDPOINT" ;; *) URL="https://$ENDPOINT" ;; esac
if [ -z "${BHAROSA_BASE_URL:-}" ]; then
  echo "Second pass: setting BaseUrl=$URL"
  deploy BaseUrl="$URL"
fi
echo
echo "Bharosa is live at: $URL"
echo "Create a family at: $URL/setup"
