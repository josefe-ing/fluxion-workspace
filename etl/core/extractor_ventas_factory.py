#!/usr/bin/env python3
"""
Factory para crear el extractor de ventas apropiado según configuración
Permite cambiar fácilmente entre SQL Server y API sin modificar código
"""

import os
from typing import Any


def get_ventas_extractor() -> Any:
    """
    Factory method que retorna el extractor de ventas apropiado según configuración

    Revisa la variable de entorno VENTAS_EXTRACTOR_TYPE para decidir:
    - "sql_server": Usa extractor_ventas.py (SQL Server directo)
    - "api": Usa extractor_ventas_api.py (API REST del nuevo proveedor)

    Returns:
        Instancia del extractor configurado (VentasExtractor o VentasAPIExtractor)
    """

    extractor_type = os.getenv("VENTAS_EXTRACTOR_TYPE", "sql_server").lower()

    if extractor_type == "api":
        # Importar extractor API
        from extractor_ventas_api import VentasAPIExtractor
        print("📡 Usando extractor de ventas vía API REST")
        return VentasAPIExtractor()

    else:
        # Por defecto, usar extractor SQL Server (método actual)
        from extractor_ventas import VentasExtractor
        print("🗄️  Usando extractor de ventas vía SQL Server")
        return VentasExtractor()
