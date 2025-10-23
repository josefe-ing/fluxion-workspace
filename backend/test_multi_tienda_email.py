#!/usr/bin/env python3
"""
Test script for multi-tienda email notifications
Usage: python3 test_multi_tienda_email.py
"""

import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Load environment variables from .env.development
from dotenv import load_dotenv
env_file = Path(__file__).parent / '.env.development'
load_dotenv(env_file)

from email_notifier import email_notifier

def test_ventas_email():
    """Test ventas ETL email with múltiples tiendas"""
    print("\n📨 Sending test Ventas ETL email with multiple tiendas...")

    # Simulate results from multiple tiendas
    tiendas_results = [
        {
            'tienda_id': 'tienda_01',
            'nombre': 'CEDI Frio',
            'success': True,
            'registros': 15234,
            'tiempo_proceso': 45.3,
            'message': 'Sincronización exitosa'
        },
        {
            'tienda_id': 'tienda_02',
            'nombre': 'CEDI Seco',
            'success': True,
            'registros': 8921,
            'tiempo_proceso': 32.1,
            'message': 'Sincronización exitosa'
        },
        {
            'tienda_id': 'tienda_03',
            'nombre': 'CEDI Verde',
            'success': True,
            'registros': 6543,
            'tiempo_proceso': 28.7,
            'message': 'Sincronización exitosa'
        },
        {
            'tienda_id': 'tienda_04',
            'nombre': 'AV. BOLIVAR',
            'success': True,
            'registros': 12456,
            'tiempo_proceso': 38.9,
            'message': 'Sincronización exitosa'
        },
        {
            'tienda_id': 'tienda_05',
            'nombre': 'BOSQUE',
            'success': False,
            'registros': 0,
            'tiempo_proceso': 5.2,
            'message': 'Error de conexión: Timeout al conectar con el servidor'
        },
        {
            'tienda_id': 'tienda_06',
            'nombre': 'CENTRO',
            'success': True,
            'registros': 9876,
            'tiempo_proceso': 35.4,
            'message': 'Sincronización exitosa'
        },
        {
            'tienda_id': 'tienda_07',
            'nombre': 'FERIAS',
            'success': True,
            'registros': 11234,
            'tiempo_proceso': 41.2,
            'message': 'Sincronización exitosa'
        },
        {
            'tienda_id': 'tienda_08',
            'nombre': 'FLOR AMARILLO',
            'success': True,
            'registros': 7654,
            'tiempo_proceso': 29.8,
            'message': 'Sincronización exitosa'
        }
    ]

    # Simulate start and end times
    start_time = datetime(2025, 10, 22, 5, 0, 0)
    end_time = datetime(2025, 10, 22, 5, 7, 32)

    # Global summary
    global_summary = {
        'Fecha procesada': '2025-10-21',
        'Tipo de ejecución': 'Automática (scheduler)',
        'Promedio por tienda': '34.5s'
    }

    # Send email
    success = email_notifier.send_multi_tienda_etl_summary(
        etl_name='ETL Ventas Diarias',
        etl_type='ventas',
        start_time=start_time,
        end_time=end_time,
        tiendas_results=tiendas_results,
        global_summary=global_summary
    )

    if success:
        print('✅ Ventas ETL email sent successfully!')
    else:
        print('❌ Failed to send ventas ETL email')

    return success

def test_inventario_email():
    """Test inventario ETL email with múltiples tiendas"""
    print("\n📨 Sending test Inventario ETL email with multiple tiendas...")

    # Simulate results from multiple tiendas
    tiendas_results = [
        {
            'tienda_id': 'tienda_01',
            'nombre': 'CEDI Frio',
            'success': True,
            'registros': 2845,
            'tiempo_proceso': 12.3,
            'message': 'Inventario sincronizado'
        },
        {
            'tienda_id': 'tienda_02',
            'nombre': 'CEDI Seco',
            'success': True,
            'registros': 3214,
            'tiempo_proceso': 15.7,
            'message': 'Inventario sincronizado'
        },
        {
            'tienda_id': 'tienda_03',
            'nombre': 'CEDI Verde',
            'success': True,
            'registros': 1987,
            'tiempo_proceso': 9.8,
            'message': 'Inventario sincronizado'
        },
        {
            'tienda_id': 'tienda_04',
            'nombre': 'AV. BOLIVAR',
            'success': True,
            'registros': 4123,
            'tiempo_proceso': 18.2,
            'message': 'Inventario sincronizado'
        },
        {
            'tienda_id': 'tienda_05',
            'nombre': 'BOSQUE',
            'success': True,
            'registros': 3654,
            'tiempo_proceso': 16.4,
            'message': 'Inventario sincronizado'
        }
    ]

    # Simulate start and end times
    start_time = datetime(2025, 10, 22, 6, 0, 0)
    end_time = datetime(2025, 10, 22, 6, 2, 15)

    # Global summary
    global_summary = {
        'Ejecución': 'Manual',
        'Productos únicos': '8,543',
        'Promedio por tienda': '14.5s'
    }

    # Send email
    success = email_notifier.send_multi_tienda_etl_summary(
        etl_name='ETL Inventario',
        etl_type='inventario',
        start_time=start_time,
        end_time=end_time,
        tiendas_results=tiendas_results,
        global_summary=global_summary
    )

    if success:
        print('✅ Inventario ETL email sent successfully!')
    else:
        print('❌ Failed to send inventario ETL email')

    return success

def main():
    """Main test function"""
    print("\n🧪 Testing Multi-Tienda Email Notifications")
    print("="*60)

    if not email_notifier.enabled:
        print("❌ Email notifications are DISABLED")
        print("Please configure SENDGRID_API_KEY in .env.development")
        sys.exit(1)

    print(f"✓ Sending to: {os.getenv('NOTIFICATION_EMAILS')}")
    print("="*60)

    # Test ventas email
    ventas_success = test_ventas_email()

    print("\n" + "="*60)
    input("Press Enter to send Inventario email...")

    # Test inventario email
    inventario_success = test_inventario_email()

    # Summary
    print("\n" + "="*60)
    if ventas_success and inventario_success:
        print("✅ All test emails sent successfully!")
        print(f"📬 Check your inbox: {os.getenv('NOTIFICATION_EMAILS')}")
    else:
        print("❌ Some emails failed to send")

    print("="*60 + "\n")

if __name__ == "__main__":
    main()
