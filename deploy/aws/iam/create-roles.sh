#!/bin/bash
# Recreates the two IAM roles Recollect's AWS deployment uses, exactly as first created on 16 Oct
# (see docs/deploy-aws.md). Needs an IAM admin profile; run from the repo root:
#   AWS_PROFILE=default bash deploy/aws/iam/create-roles.sh
set -euo pipefail
D="$(dirname "$0")"
export AWS_REGION=us-east-1 MSYS_NO_PATHCONV=1

aws iam create-role --role-name recollect-ec2 --assume-role-policy-document "file://$D/ec2-trust.json" \
  --tags Key=project,Value=recollect --query Role.Arn --output text
aws iam put-role-policy --role-name recollect-ec2 --policy-name recollect-ec2 --policy-document "file://$D/ec2-perms.json"
aws iam attach-role-policy --role-name recollect-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name recollect-ec2 --query InstanceProfile.Arn --output text
aws iam add-role-to-instance-profile --instance-profile-name recollect-ec2 --role-name recollect-ec2

aws iam create-role --role-name recollect-agentcore --assume-role-policy-document "file://$D/agentcore-trust.json" \
  --tags Key=project,Value=recollect --query Role.Arn --output text
aws iam put-role-policy --role-name recollect-agentcore --policy-name recollect-agentcore \
  --policy-document "file://$D/agentcore-perms.json"
echo "roles created"
