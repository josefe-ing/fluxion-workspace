"""
AWS Secrets Manager Integration for Fluxion Backend

This module handles fetching secrets from AWS Secrets Manager.
Secrets are cached in memory to reduce API calls.
"""

import json
import os
from typing import Dict, Optional
import boto3
from botocore.exceptions import ClientError


class SecretsManager:
    """Manages secrets from AWS Secrets Manager with caching."""

    _cache: Dict[str, any] = {}
    _client = None

    @classmethod
    def get_client(cls):
        """Get or create boto3 Secrets Manager client."""
        if cls._client is None:
            cls._client = boto3.client('secretsmanager', region_name='us-east-1')
        return cls._client

    @classmethod
    def get_secret(cls, secret_name: str, force_refresh: bool = False) -> Dict:
        """
        Retrieve a secret from AWS Secrets Manager.

        Args:
            secret_name: Name of the secret in AWS Secrets Manager
            force_refresh: If True, bypass cache and fetch fresh secret

        Returns:
            Dictionary containing the secret values

        Raises:
            ClientError: If secret cannot be retrieved
        """
        # Return cached value if available and not forcing refresh
        if not force_refresh and secret_name in cls._cache:
            return cls._cache[secret_name]

        try:
            client = cls.get_client()
            response = client.get_secret_value(SecretId=secret_name)

            # Parse the secret string as JSON
            if 'SecretString' in response:
                secret = json.loads(response['SecretString'])
            else:
                # Binary secrets (less common)
                secret = response['SecretBinary']

            # Cache the secret
            cls._cache[secret_name] = secret
            return secret

        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'ResourceNotFoundException':
                raise ValueError(f"Secret '{secret_name}' not found in AWS Secrets Manager")
            elif error_code == 'InvalidRequestException':
                raise ValueError(f"Invalid request for secret '{secret_name}'")
            elif error_code == 'InvalidParameterException':
                raise ValueError(f"Invalid parameter for secret '{secret_name}'")
            else:
                raise

    @classmethod
    def get_value(cls, secret_name: str, key: str, default: Optional[str] = None) -> Optional[str]:
        """
        Get a specific value from a secret.

        Args:
            secret_name: Name of the secret in AWS Secrets Manager
            key: Key within the secret JSON
            default: Default value if key not found

        Returns:
            The secret value or default
        """
        try:
            secret = cls.get_secret(secret_name)
            return secret.get(key, default)
        except Exception as e:
            print(f"Warning: Could not retrieve secret '{secret_name}': {e}")
            return default

    @classmethod
    def clear_cache(cls):
        """Clear the secrets cache. Useful for testing or forcing refresh."""
        cls._cache.clear()


# Convenience function for common pattern
def get_secret_value(secret_name: str, key: str, fallback_env: Optional[str] = None) -> Optional[str]:
    """
    Get a secret value with fallback to environment variable.

    This allows local development with .env files while using
    AWS Secrets Manager in production.

    Args:
        secret_name: Name of the secret in AWS Secrets Manager
        key: Key within the secret JSON
        fallback_env: Environment variable name to use if secret not available

    Returns:
        The secret value, environment variable value, or None

    Example:
        sendgrid_key = get_secret_value(
            'fluxion/production',
            'SENDGRID_API_KEY',
            fallback_env='SENDGRID_API_KEY'
        )
    """
    # Try AWS Secrets Manager first
    try:
        value = SecretsManager.get_value(secret_name, key)
        if value is not None:
            return value
    except Exception as e:
        print(f"Warning: AWS Secrets Manager not available: {e}")

    # Fallback to environment variable
    if fallback_env:
        return os.getenv(fallback_env)

    return None


# Example usage
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python secrets_manager.py <secret-name>")
        print("Example: python secrets_manager.py fluxion/production")
        sys.exit(1)

    secret_name = sys.argv[1]

    try:
        secret = SecretsManager.get_secret(secret_name)
        print(f"Secret '{secret_name}' retrieved successfully:")
        # Don't print actual values for security
        print(f"Keys: {list(secret.keys())}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
