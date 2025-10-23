#!/usr/bin/env python3
"""
Helper script to store secrets in AWS Secrets Manager

Usage:
    python store_secret.py create fluxion/production
    python store_secret.py update fluxion/production SENDGRID_API_KEY <new-value>
    python store_secret.py get fluxion/production
"""

import sys
import json
import boto3
from botocore.exceptions import ClientError


def create_secret(secret_name: str):
    """Create a new secret in AWS Secrets Manager."""
    client = boto3.client('secretsmanager', region_name='us-east-1')

    # Template for Fluxion secrets
    secret_value = {
        "SENDGRID_API_KEY": "",
        "SENDGRID_FROM_EMAIL": "notificaciones@fluxionia.co",
        "NOTIFICATION_EMAILS": "jose@josefelipelopez.com",
        "SENTRY_DSN": "",
        "JWT_SECRET_KEY": "",
        "SQL_SERVER_HOST": "",
        "SQL_SERVER_PASSWORD": ""
    }

    try:
        response = client.create_secret(
            Name=secret_name,
            Description='Fluxion application secrets',
            SecretString=json.dumps(secret_value)
        )
        print(f"✓ Secret created successfully: {response['ARN']}")
        print(f"\nNow update the values using:")
        print(f"  python store_secret.py update {secret_name} SENDGRID_API_KEY <your-key>")
        return True

    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceExistsException':
            print(f"✗ Secret '{secret_name}' already exists")
            print(f"  Use 'update' command to modify it")
        else:
            print(f"✗ Error creating secret: {e}")
        return False


def update_secret_key(secret_name: str, key: str, value: str):
    """Update a specific key in an existing secret."""
    client = boto3.client('secretsmanager', region_name='us-east-1')

    try:
        # Get current secret
        response = client.get_secret_value(SecretId=secret_name)
        current_secret = json.loads(response['SecretString'])

        # Update the key
        current_secret[key] = value

        # Store updated secret
        client.put_secret_value(
            SecretId=secret_name,
            SecretString=json.dumps(current_secret)
        )

        print(f"✓ Successfully updated '{key}' in secret '{secret_name}'")
        return True

    except ClientError as e:
        print(f"✗ Error updating secret: {e}")
        return False


def get_secret(secret_name: str, show_values: bool = False):
    """Retrieve and display a secret."""
    client = boto3.client('secretsmanager', region_name='us-east-1')

    try:
        response = client.get_secret_value(SecretId=secret_name)
        secret = json.loads(response['SecretString'])

        print(f"\nSecret: {secret_name}")
        print("-" * 60)

        for key, value in secret.items():
            if show_values:
                print(f"{key}: {value}")
            else:
                # Mask the value for security
                if value:
                    masked = f"{value[:8]}...{value[-4:]}" if len(value) > 12 else "***"
                else:
                    masked = "(empty)"
                print(f"{key}: {masked}")

        return True

    except ClientError as e:
        print(f"✗ Error retrieving secret: {e}")
        return False


def delete_secret(secret_name: str):
    """Delete a secret (with recovery period)."""
    client = boto3.client('secretsmanager', region_name='us-east-1')

    confirm = input(f"Are you sure you want to delete '{secret_name}'? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Cancelled")
        return False

    try:
        response = client.delete_secret(
            SecretId=secret_name,
            RecoveryWindowInDays=7  # Can be recovered within 7 days
        )
        print(f"✓ Secret scheduled for deletion")
        print(f"  Deletion date: {response['DeletionDate']}")
        print(f"  Can be recovered within 7 days using AWS Console")
        return True

    except ClientError as e:
        print(f"✗ Error deleting secret: {e}")
        return False


def main():
    if len(sys.argv) < 3:
        print("AWS Secrets Manager Helper for Fluxion")
        print("\nUsage:")
        print("  Create new secret:")
        print("    python store_secret.py create <secret-name>")
        print("\n  Update secret key:")
        print("    python store_secret.py update <secret-name> <key> <value>")
        print("\n  Get secret (masked):")
        print("    python store_secret.py get <secret-name>")
        print("\n  Get secret (show values):")
        print("    python store_secret.py get <secret-name> --show")
        print("\n  Delete secret:")
        print("    python store_secret.py delete <secret-name>")
        print("\nExample:")
        print("  python store_secret.py create fluxion/production")
        print("  python store_secret.py update fluxion/production SENDGRID_API_KEY SG.xxx...")
        sys.exit(1)

    command = sys.argv[1]
    secret_name = sys.argv[2]

    if command == 'create':
        create_secret(secret_name)

    elif command == 'update':
        if len(sys.argv) < 5:
            print("✗ Usage: python store_secret.py update <secret-name> <key> <value>")
            sys.exit(1)
        key = sys.argv[3]
        value = sys.argv[4]
        update_secret_key(secret_name, key, value)

    elif command == 'get':
        show_values = '--show' in sys.argv
        get_secret(secret_name, show_values)

    elif command == 'delete':
        delete_secret(secret_name)

    else:
        print(f"✗ Unknown command: {command}")
        print("  Valid commands: create, update, get, delete")
        sys.exit(1)


if __name__ == "__main__":
    main()
