#!/usr/bin/env python3
"""
Email Notification Module for Fluxion AI
Sends ETL execution summaries via SendGrid
"""

import os
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Email, To, Content

logger = logging.getLogger(__name__)


class EmailNotifier:
    """
    Email notification service using SendGrid
    """

    def __init__(self):
        """Initialize SendGrid client"""
        self.api_key = os.getenv("SENDGRID_API_KEY")
        self.from_email = os.getenv("SENDGRID_FROM_EMAIL", "noreply@fluxionia.co")
        self.to_emails = os.getenv("NOTIFICATION_EMAILS", "").split(",")

        if not self.api_key:
            logger.warning("⚠️  SENDGRID_API_KEY not configured - email notifications disabled")
            self.enabled = False
        elif not self.to_emails or self.to_emails == [""]:
            logger.warning("⚠️  NOTIFICATION_EMAILS not configured - email notifications disabled")
            self.enabled = False
        else:
            self.enabled = True
            self.client = SendGridAPIClient(self.api_key)
            logger.info(f"✅ Email notifications enabled - sending to: {', '.join(self.to_emails)}")

    def send_etl_summary(
        self,
        etl_name: str,
        status: str,
        start_time: datetime,
        end_time: datetime,
        records_processed: int,
        errors: List[str] = None,
        summary: Dict = None
    ) -> bool:
        """
        Send ETL execution summary email

        Args:
            etl_name: Name of the ETL job
            status: "SUCCESS" or "FAILED"
            start_time: When the ETL started
            end_time: When the ETL finished
            records_processed: Number of records processed
            errors: List of error messages (if any)
            summary: Additional summary data

        Returns:
            True if email sent successfully, False otherwise
        """
        if not self.enabled:
            logger.debug("Email notifications disabled - skipping")
            return False

        try:
            # Calculate duration
            duration = end_time - start_time
            duration_str = str(duration).split('.')[0]  # Remove microseconds

            # Build email subject
            status_emoji = "✅" if status == "SUCCESS" else "❌"
            subject = f"{status_emoji} Fluxion AI - {etl_name} {status}"

            # Build email body
            body = self._build_email_body(
                etl_name=etl_name,
                status=status,
                start_time=start_time,
                end_time=end_time,
                duration=duration_str,
                records_processed=records_processed,
                errors=errors,
                summary=summary
            )

            # Create message
            message = Mail(
                from_email=Email(self.from_email, "Fluxion AI"),
                to_emails=[To(email.strip()) for email in self.to_emails],
                subject=subject,
                html_content=Content("text/html", body)
            )

            # Send email
            response = self.client.send(message)

            if response.status_code in [200, 201, 202]:
                logger.info(f"📧 Email notification sent successfully for {etl_name}")
                return True
            else:
                logger.error(f"❌ Failed to send email: HTTP {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"❌ Error sending email notification: {e}")
            return False

    def _build_email_body(
        self,
        etl_name: str,
        status: str,
        start_time: datetime,
        end_time: datetime,
        duration: str,
        records_processed: int,
        errors: List[str] = None,
        summary: Dict = None
    ) -> str:
        """Build HTML email body"""

        # Status styling
        if status == "SUCCESS":
            status_color = "#10b981"  # green
            status_icon = "✅"
        else:
            status_color = "#ef4444"  # red
            status_icon = "❌"

        # Format times
        start_str = start_time.strftime("%Y-%m-%d %H:%M:%S")
        end_str = end_time.strftime("%Y-%m-%d %H:%M:%S")

        # Build summary section
        summary_html = ""
        if summary:
            summary_rows = ""
            for key, value in summary.items():
                summary_rows += f"""
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{key}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">{value}</td>
                </tr>
                """
            summary_html = f"""
            <h2 style="color: #374151; font-size: 18px; margin-top: 24px;">📊 Summary</h2>
            <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
                {summary_rows}
            </table>
            """

        # Build errors section
        errors_html = ""
        if errors and len(errors) > 0:
            error_items = ""
            for error in errors[:10]:  # Show max 10 errors
                error_items += f"<li style='margin-bottom: 8px;'>{error}</li>"

            more_errors = ""
            if len(errors) > 10:
                more_errors = f"<p style='color: #6b7280; margin-top: 8px;'>... and {len(errors) - 10} more errors</p>"

            errors_html = f"""
            <h2 style="color: #374151; font-size: 18px; margin-top: 24px;">⚠️ Errors</h2>
            <ul style="color: #ef4444; margin-top: 12px; padding-left: 20px;">
                {error_items}
            </ul>
            {more_errors}
            """

        # Build full HTML
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">

                <!-- Header -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Fluxion AI</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">ETL Execution Report</p>
                </div>

                <!-- Content -->
                <div style="padding: 24px;">

                    <!-- Status Badge -->
                    <div style="text-align: center; margin-bottom: 24px;">
                        <span style="display: inline-block; background-color: {status_color}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px;">
                            {status_icon} {status}
                        </span>
                    </div>

                    <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 16px 0;">{etl_name}</h2>

                    <!-- Details Table -->
                    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Start Time</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{start_str}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">End Time</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{end_str}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Duration</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{duration}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Records Processed</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{records_processed:,}</td>
                        </tr>
                    </table>

                    {summary_html}
                    {errors_html}

                </div>

                <!-- Footer -->
                <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        Fluxion AI - Intelligent Inventory Management
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0 0;">
                        <a href="https://granja.fluxionia.co" style="color: #667eea; text-decoration: none;">View Dashboard</a>
                    </p>
                </div>

            </div>
        </body>
        </html>
        """

        return html

    def send_multi_tienda_etl_summary(
        self,
        etl_name: str,
        etl_type: str,  # "ventas" or "inventario"
        start_time: datetime,
        end_time: datetime,
        tiendas_results: List[Dict[str, Any]],
        global_summary: Dict[str, Any] = None
    ) -> bool:
        """
        Send detailed ETL summary for multi-tienda execution

        Args:
            etl_name: Name of the ETL (e.g., "ETL Ventas Diarias")
            etl_type: Type of ETL ("ventas" or "inventario")
            start_time: Start time
            end_time: End time
            tiendas_results: List of results per tienda with format:
                [{
                    'tienda_id': 'tienda_01',
                    'nombre': 'CEDI Frio',
                    'success': True/False,
                    'registros': 1234,
                    'tiempo_proceso': 45.2,  # seconds
                    'message': 'Success message or error',
                    'detalles': {...}  # optional extra details
                }, ...]
            global_summary: Optional global summary stats

        Returns:
            True if email sent successfully
        """
        if not self.enabled:
            logger.debug("Email notifications disabled - skipping")
            return False

        # Calculate stats
        total_tiendas = len(tiendas_results)
        tiendas_exitosas = sum(1 for t in tiendas_results if t.get('success', False))
        tiendas_fallidas = total_tiendas - tiendas_exitosas
        total_registros = sum(t.get('registros', 0) for t in tiendas_results)

        # Determine overall status
        if tiendas_fallidas == 0:
            status = "SUCCESS"
        elif tiendas_exitosas == 0:
            status = "FAILED"
        else:
            status = "PARTIAL SUCCESS"

        # Build summary
        summary = {
            "Tiendas procesadas": f"{tiendas_exitosas}/{total_tiendas}",
            "Registros totales": f"{total_registros:,}",
            "Tiendas exitosas": tiendas_exitosas,
            "Tiendas fallidas": tiendas_fallidas
        }

        if global_summary:
            summary.update(global_summary)

        # Build detailed tiendas table
        tiendas_html = self._build_tiendas_detail_table(tiendas_results, etl_type)

        # Build errors list
        errors = []
        for tienda in tiendas_results:
            if not tienda.get('success', False):
                error_msg = f"{tienda.get('nombre', tienda.get('tienda_id', 'Unknown'))}: {tienda.get('message', 'Error desconocido')}"
                errors.append(error_msg)

        # Send email with custom tiendas table
        return self._send_custom_etl_email(
            etl_name=etl_name,
            status=status,
            start_time=start_time,
            end_time=end_time,
            records_processed=total_registros,
            summary=summary,
            errors=errors if errors else None,
            custom_html=tiendas_html
        )

    def _build_tiendas_detail_table(self, tiendas_results: List[Dict], etl_type: str) -> str:
        """Build detailed HTML table for tiendas results"""
        rows_html = ""

        for tienda in tiendas_results:
            # Status icon and color
            if tienda.get('success', False):
                status_icon = "✅"
                status_color = "#10b981"
                status_text = "OK"
            else:
                status_icon = "❌"
                status_color = "#ef4444"
                status_text = "ERROR"

            # Format values
            nombre = tienda.get('nombre', tienda.get('tienda_id', 'Unknown'))
            registros = tienda.get('registros', 0)
            tiempo = tienda.get('tiempo_proceso', 0)
            mensaje = tienda.get('message', 'Sin mensaje')

            # Build row
            rows_html += f"""
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 8px;">
                    <span style="color: {status_color}; font-weight: 600;">{status_icon} {nombre}</span>
                </td>
                <td style="padding: 12px 8px; text-align: center;">
                    <span style="background-color: {status_color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                        {status_text}
                    </span>
                </td>
                <td style="padding: 12px 8px; text-align: right; font-weight: 600;">
                    {registros:,}
                </td>
                <td style="padding: 12px 8px; text-align: right;">
                    {tiempo:.1f}s
                </td>
            </tr>
            """

        table_html = f"""
        <h2 style="color: #374151; font-size: 18px; margin-top: 24px;">🏪 Detalle por Tienda</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px;">
            <thead>
                <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                    <th style="padding: 12px 8px; text-align: left; color: #6b7280; font-weight: 600;">Tienda</th>
                    <th style="padding: 12px 8px; text-align: center; color: #6b7280; font-weight: 600;">Estado</th>
                    <th style="padding: 12px 8px; text-align: right; color: #6b7280; font-weight: 600;">Registros</th>
                    <th style="padding: 12px 8px; text-align: right; color: #6b7280; font-weight: 600;">Tiempo</th>
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
        """

        return table_html

    def _send_custom_etl_email(
        self,
        etl_name: str,
        status: str,
        start_time: datetime,
        end_time: datetime,
        records_processed: int,
        summary: Dict,
        errors: List[str] = None,
        custom_html: str = ""
    ) -> bool:
        """Send ETL email with custom HTML section"""
        try:
            # Calculate duration
            duration = end_time - start_time
            duration_str = str(duration).split('.')[0]

            # Build email subject
            status_emoji = "✅" if status == "SUCCESS" else ("⚠️" if status == "PARTIAL SUCCESS" else "❌")
            subject = f"{status_emoji} Fluxion AI - {etl_name} {status}"

            # Build email body with custom HTML
            body = self._build_custom_email_body(
                etl_name=etl_name,
                status=status,
                start_time=start_time,
                end_time=end_time,
                duration=duration_str,
                records_processed=records_processed,
                summary=summary,
                errors=errors,
                custom_html=custom_html
            )

            # Create message
            message = Mail(
                from_email=Email(self.from_email, "Fluxion AI"),
                to_emails=[To(email.strip()) for email in self.to_emails],
                subject=subject,
                html_content=Content("text/html", body)
            )

            # Send email
            response = self.client.send(message)

            if response.status_code in [200, 201, 202]:
                logger.info(f"📧 Email notification sent successfully for {etl_name}")
                return True
            else:
                logger.error(f"❌ Failed to send email: HTTP {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"❌ Error sending email notification: {e}")
            return False

    def _build_custom_email_body(
        self,
        etl_name: str,
        status: str,
        start_time: datetime,
        end_time: datetime,
        duration: str,
        records_processed: int,
        summary: Dict,
        errors: List[str] = None,
        custom_html: str = ""
    ) -> str:
        """Build custom HTML email body with extra sections"""

        # Status styling
        if status == "SUCCESS":
            status_color = "#10b981"
            status_icon = "✅"
        elif status == "PARTIAL SUCCESS":
            status_color = "#f59e0b"
            status_icon = "⚠️"
        else:
            status_color = "#ef4444"
            status_icon = "❌"

        # Format times
        start_str = start_time.strftime("%Y-%m-%d %H:%M:%S")
        end_str = end_time.strftime("%Y-%m-%d %H:%M:%S")

        # Build summary section
        summary_rows = ""
        for key, value in summary.items():
            summary_rows += f"""
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{key}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">{value}</td>
            </tr>
            """

        # Build errors section
        errors_html = ""
        if errors and len(errors) > 0:
            error_items = ""
            for error in errors[:10]:
                error_items += f"<li style='margin-bottom: 8px;'>{error}</li>"

            more_errors = ""
            if len(errors) > 10:
                more_errors = f"<p style='color: #6b7280; margin-top: 8px;'>... y {len(errors) - 10} errores más</p>"

            errors_html = f"""
            <h2 style="color: #374151; font-size: 18px; margin-top: 24px;">⚠️ Errores</h2>
            <ul style="color: #ef4444; margin-top: 12px; padding-left: 20px;">
                {error_items}
            </ul>
            {more_errors}
            """

        # Build full HTML
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
            <div style="max-width: 800px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">

                <!-- Header -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Fluxion AI</h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">ETL Execution Report</p>
                </div>

                <!-- Content -->
                <div style="padding: 24px;">

                    <!-- Status Badge -->
                    <div style="text-align: center; margin-bottom: 24px;">
                        <span style="display: inline-block; background-color: {status_color}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px;">
                            {status_icon} {status}
                        </span>
                    </div>

                    <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 16px 0;">{etl_name}</h2>

                    <!-- Details Table -->
                    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Inicio</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{start_str}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Fin</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{end_str}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Duración</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{duration}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Registros Procesados</td>
                            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">{records_processed:,}</td>
                        </tr>
                    </table>

                    <h2 style="color: #374151; font-size: 18px; margin-top: 24px;">📊 Resumen</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
                        {summary_rows}
                    </table>

                    {custom_html}
                    {errors_html}

                </div>

                <!-- Footer -->
                <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        Fluxion AI - Intelligent Inventory Management
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0 0;">
                        <a href="https://granja.fluxionia.co" style="color: #667eea; text-decoration: none;">Ver Dashboard</a>
                    </p>
                </div>

            </div>
        </body>
        </html>
        """

        return html

    def send_test_email(self) -> bool:
        """Send a test email to verify configuration"""
        if not self.enabled:
            logger.error("❌ Email notifications not enabled")
            return False

        return self.send_etl_summary(
            etl_name="Test Email",
            status="SUCCESS",
            start_time=datetime.now(),
            end_time=datetime.now(),
            records_processed=0,
            summary={
                "Test": "This is a test email",
                "Configuration": "Working correctly"
            }
        )


# Global instance
email_notifier = EmailNotifier()


def send_etl_notification(**kwargs):
    """Convenience function to send ETL notification"""
    return email_notifier.send_etl_summary(**kwargs)


def send_multi_tienda_notification(**kwargs):
    """Convenience function to send multi-tienda ETL notification"""
    return email_notifier.send_multi_tienda_etl_summary(**kwargs)
