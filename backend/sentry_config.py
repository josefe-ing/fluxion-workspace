"""
Sentry Configuration for Error Tracking
https://sentry.io/
"""

import os
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

def init_sentry():
    """
    Initialize Sentry SDK for error tracking
    Only enabled in production with SENTRY_DSN env var
    """
    sentry_dsn = os.getenv("SENTRY_DSN")
    environment = os.getenv("ENVIRONMENT", "development")

    if not sentry_dsn:
        print("[Sentry] DSN not configured, skipping initialization")
        return

    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=environment,
        # Set traces_sample_rate to 1.0 to capture 100%
        # of transactions for performance monitoring.
        # We recommend adjusting this value in production,
        traces_sample_rate=1.0 if environment == "development" else 0.1,

        # Set profiles_sample_rate to 1.0 to profile 100%
        # of sampled transactions.
        # We recommend adjusting this value in production,
        profiles_sample_rate=1.0 if environment == "development" else 0.1,

        # Integrations
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            StarletteIntegration(transaction_style="endpoint"),
        ],

        # Send default PII (Personally Identifiable Information)
        send_default_pii=False,

        # Before send callback (to filter sensitive data)
        before_send=before_send_callback,
    )

    print(f"[Sentry] Initialized for environment: {environment}")


def before_send_callback(event, hint):
    """
    Callback to filter sensitive data before sending to Sentry
    """
    # Filter out sensitive headers
    if "request" in event and "headers" in event["request"]:
        headers = event["request"]["headers"]
        sensitive_headers = ["authorization", "cookie", "x-api-key"]
        for header in sensitive_headers:
            if header in headers:
                headers[header] = "[Filtered]"

    return event
