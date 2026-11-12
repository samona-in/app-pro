#!/usr/bin/env bash
#
# Creates the dedicated services bucket and grants anonymous read only under
# services/*. Idempotent: running it again re-applies the same configuration.
#
# This is deliberately the only place that opens public read. Listing is never
# granted, and no other prefix in the bucket is public.
#
# Usage:
#   ./scripts/service-images-migration/create-bucket.sh
#   ./scripts/service-images-migration/create-bucket.sh <bucket> <region>
set -euo pipefail

BUCKET="${1:-samona-staging-services-072842665972}"
REGION="${2:-us-east-1}"

if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
  echo "Bucket s3://$BUCKET already exists."
else
  echo "Creating s3://$BUCKET in $REGION …"
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket \
      --bucket "$BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
fi

# Encryption at rest. SSE-S3 matches the other buckets and needs no KMS policy.
aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' >/dev/null

# Block public ACLs and public listing, but allow a bucket policy that grants
# GetObject on services/*. BlockPublicPolicy must be false for that policy to
# be accepted; RestrictPublicBuckets must be false for anonymous reads to work.
aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --public-access-block-configuration \
  'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false' >/dev/null

POLICY_FILE="$(mktemp)"
trap 'rm -f "$POLICY_FILE"' EXIT

cat >"$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::${BUCKET}",
        "arn:aws:s3:::${BUCKET}/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    },
    {
      "Sid": "PublicReadServiceImagesOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/services/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --policy "file://$POLICY_FILE" >/dev/null

echo "Configured s3://$BUCKET"
echo "  public read: arn:aws:s3:::$BUCKET/services/*"
echo "  listing:     denied"
echo "  base URL:    https://$BUCKET.s3.$REGION.amazonaws.com/services/"
