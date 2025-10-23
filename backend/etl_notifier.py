#!/usr/bin/env python3
"""
ETL Notification Wrapper
Handles email notifications for ETL executions (production only)
"""

import os
import logging
from datetime import datetime
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Check if we're in production
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"

# Import email notifier only if needed
if IS_PRODUCTION:
    try:
        from email_notifier import send_multi_tienda_notification
        NOTIFICATIONS_ENABLED = True
        logger.info("📧 Email notifications ENABLED (production mode)")
    except Exception as e:
        logger.warning(f"⚠️  Could not import email_notifier: {e}")
        NOTIFICATIONS_ENABLED = False
else:
    NOTIFICATIONS_ENABLED = False
    logger.info("📧 Email notifications DISABLED (development mode)")


def send_etl_notification(
    etl_name: str,
    etl_type: str,
    start_time: datetime,
    end_time: datetime,
    tiendas_results: List[Dict[str, Any]],
    global_summary: Dict[str, Any] = None
) -> bool:
    """
    Send ETL notification email (only in production)

    Args:
        etl_name: Name of ETL (e.g., "ETL Ventas Diarias")
        etl_type: Type of ETL ("ventas" or "inventario")
        start_time: Start time
        end_time: End time
        tiendas_results: List of results per tienda
        global_summary: Optional global summary

    Returns:
        True if notification sent (or skipped in dev), False on error
    """
    if not IS_PRODUCTION:
        logger.debug(f"Skipping email notification for {etl_name} (development mode)")
        return True  # Return True to not break the flow

    if not NOTIFICATIONS_ENABLED:
        logger.warning(f"Email notifications disabled - skipping notification for {etl_name}")
        return True

    try:
        logger.info(f"📧 Sending email notification for {etl_name}...")

        success = send_multi_tienda_notification(
            etl_name=etl_name,
            etl_type=etl_type,
            start_time=start_time,
            end_time=end_time,
            tiendas_results=tiendas_results,
            global_summary=global_summary
        )

        if success:
            logger.info(f"✅ Email notification sent successfully for {etl_name}")
        else:
            logger.error(f"❌ Failed to send email notification for {etl_name}")

        return success

    except Exception as e:
        logger.error(f"❌ Error sending email notification for {etl_name}: {e}")
        return False
