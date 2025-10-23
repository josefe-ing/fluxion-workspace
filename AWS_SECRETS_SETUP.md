# AWS Secrets Manager Setup Guide

**Date:** October 22, 2025
**Purpose:** Secure storage of application secrets using AWS Secrets Manager

## Overview

This guide explains how to migrate from storing secrets in `.env` files to using AWS Secrets Manager for production-grade security.

## Why AWS Secrets Manager?

- **Security:** Secrets are encrypted at rest and in transit
- **Rotation:** Automatic rotation of credentials
- **Audit:** Full audit trail of secret access via CloudTrail
- **Access Control:** Fine-grained IAM permissions
- **No Git Exposure:** Secrets never committed to version control

## Prerequisites

1. **AWS CLI installed and configured:**
   ```bash
   aws --version
   aws configure list
   ```

2. **AWS credentials with Secrets Manager permissions:**
   - `secretsmanager:CreateSecret`
   - `secretsmanager:GetSecretValue`
   - `secretsmanager:PutSecretValue`
   - `secretsmanager:UpdateSecret`

3. **Python 3.14+ with boto3:**
   ```bash
   python --version  # Should be 3.14.0+
   pip install boto3
   ```

## Setup Instructions

### Step 1: Create SendGrid API Key

1. Go to SendGrid Dashboard: https://app.sendgrid.com/settings/api_keys
2. Click "Create API Key"
3. Name: `Fluxion Production`
4. Permissions: **Full Access** (or Mail Send if limited)
5. Copy the generated key (starts with `SG.`)
6. **Save it temporarily** - you'll need it for Step 2

### Step 2: Create Secret in AWS

```bash
cd backend
python store_secret.py create fluxion/production
```

Output:
```
✓ Secret created successfully: arn:aws:secretsmanager:us-east-1:...
```

### Step 3: Store Secrets

Store the SendGrid API key:
```bash
python store_secret.py update fluxion/production SENDGRID_API_KEY "SG.your-actual-key-here"
```

Generate and store a strong JWT secret:
```bash
python store_secret.py update fluxion/production JWT_SECRET_KEY "$(openssl rand -hex 32)"
```

Store other secrets as needed:
```bash
python store_secret.py update fluxion/production SQL_SERVER_PASSWORD "your-password"
python store_secret.py update fluxion/production SENTRY_DSN "https://your-sentry-dsn"
```

### Step 4: Verify Secrets

View stored secrets (values are masked):
```bash
python store_secret.py get fluxion/production
```

Output:
```
Secret: fluxion/production
------------------------------------------------------------
SENDGRID_API_KEY: SG.9Z1Om...fw1o
JWT_SECRET_KEY: a1b2c3d4...xyz789
SQL_SERVER_PASSWORD: (empty)
...
```

### Step 5: Configure Application

Set the environment variable to use AWS Secrets Manager:

**Development (.env.development):**
```bash
# Leave empty to use local .env values
AWS_SECRET_NAME=
```

**Production:**
```bash
# Export in your deployment environment
export AWS_SECRET_NAME=fluxion/production
```

Or add to your production `.env.production`:
```
AWS_SECRET_NAME=fluxion/production
```

### Step 6: Test Integration

Test that secrets can be retrieved:
```bash
python -c "from secrets_manager import get_secret_value; print('OK' if get_secret_value('fluxion/production', 'SENDGRID_API_KEY') else 'FAIL')"
```

## Usage in Python Code

### Simple Usage

```python
from secrets_manager import get_secret_value

# Get secret with fallback to environment variable
api_key = get_secret_value(
    'fluxion/production',           # Secret name in AWS
    'SENDGRID_API_KEY',              # Key within the secret
    fallback_env='SENDGRID_API_KEY'  # Fallback to .env if AWS unavailable
)
```

### Advanced Usage

```python
from secrets_manager import SecretsManager

# Get entire secret as dictionary
secret = SecretsManager.get_secret('fluxion/production')
api_key = secret['SENDGRID_API_KEY']
jwt_secret = secret['JWT_SECRET_KEY']

# Get specific value with default
db_password = SecretsManager.get_value(
    'fluxion/production',
    'SQL_SERVER_PASSWORD',
    default='default-password'
)

# Force refresh (bypass cache)
fresh_secret = SecretsManager.get_secret('fluxion/production', force_refresh=True)

# Clear cache
SecretsManager.clear_cache()
```

## Security Best Practices

### 1. Never Commit Secrets

```bash
# Check that .gitignore is properly configured
grep -A 10 "ENVIRONMENT" .gitignore
```

Should include:
```
backend/.env.development
backend/.env.production
backend/.env
```

### 2. Rotate Secrets Regularly

```bash
# Generate new SendGrid API key
# 1. Create new key in SendGrid dashboard
# 2. Update AWS secret
python store_secret.py update fluxion/production SENDGRID_API_KEY "SG.new-key"

# 3. Test new key works
# 4. Delete old key from SendGrid dashboard
```

### 3. Use IAM Roles in Production

For EC2/ECS/Lambda, use IAM roles instead of access keys:

**IAM Policy for Application:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:fluxion/*"
    }
  ]
}
```

### 4. Monitor Secret Access

Enable CloudTrail to audit secret access:
```bash
# View recent access logs
aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=ResourceName,AttributeValue=fluxion/production \
    --max-results 10
```

## Troubleshooting

### Error: Secret not found

```
ValueError: Secret 'fluxion/production' not found in AWS Secrets Manager
```

**Solution:** Create the secret first:
```bash
python store_secret.py create fluxion/production
```

### Error: Access Denied

```
ClientError: An error occurred (AccessDeniedException) when calling the GetSecretValue operation
```

**Solution:** Check IAM permissions:
```bash
aws iam get-user
aws sts get-caller-identity
```

### Error: Invalid Secret String

```
json.decoder.JSONDecodeError: Expecting value
```

**Solution:** Secret must be valid JSON. Recreate it:
```bash
python store_secret.py delete fluxion/production
python store_secret.py create fluxion/production
```

### Fallback to Environment Variables

If AWS Secrets Manager is unavailable, the application will fall back to `.env` files:

```python
# This works even if AWS is down
api_key = get_secret_value(
    'fluxion/production',
    'SENDGRID_API_KEY',
    fallback_env='SENDGRID_API_KEY'  # Falls back to os.getenv('SENDGRID_API_KEY')
)
```

## Migration Checklist

- [ ] Revoke exposed API keys in SendGrid dashboard
- [ ] Create new SendGrid API key
- [ ] Create AWS secret: `python store_secret.py create fluxion/production`
- [ ] Store all secrets in AWS: `python store_secret.py update ...`
- [ ] Verify secrets: `python store_secret.py get fluxion/production`
- [ ] Update `.env.example` with placeholders
- [ ] Update `.gitignore` to exclude all `.env` files
- [ ] Remove `.env` files from git: `git rm --cached backend/.env*`
- [ ] Test local development still works with `.env.development`
- [ ] Configure production environment with `AWS_SECRET_NAME=fluxion/production`
- [ ] Test production deployment
- [ ] Delete old API keys from SendGrid
- [ ] Document secret rotation schedule

## Cost Considerations

AWS Secrets Manager pricing (us-east-1):
- $0.40 per secret per month
- $0.05 per 10,000 API calls

**Example cost for Fluxion:**
- 1 secret = $0.40/month
- ~10,000 API calls/month = $0.05
- **Total: ~$0.45/month**

With caching (implemented), API calls are minimized.

## Additional Resources

- **AWS Secrets Manager Docs:** https://docs.aws.amazon.com/secretsmanager/
- **Boto3 Secrets Manager:** https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/secretsmanager.html
- **SendGrid API Keys:** https://app.sendgrid.com/settings/api_keys
- **Fluxion secrets_manager.py:** [backend/secrets_manager.py](backend/secrets_manager.py)
- **Fluxion store_secret.py:** [backend/store_secret.py](backend/store_secret.py)

---

**Security Note:** This document does not contain any actual secrets. All examples use placeholders. Actual secrets should only be stored in AWS Secrets Manager or local `.env` files (never committed to git).
