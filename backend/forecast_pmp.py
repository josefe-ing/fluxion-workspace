"""
Forecast de Ventas - Promedio Móvil Ponderado (PMP)

Implementa el modelo de forecast recomendado para Fluxion AI
basado en el análisis de datos que muestra CV < 0.22 (alta predictibilidad).

Modelo: Weighted Moving Average (WMA) de 8 semanas
- 40% última semana
- 30% semana -2
- 20% semana -3
- 10% semana -4

Horizonte: 7 días (1 semana adelante)
"""

import duckdb
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import uuid


class ForecastPMP:
    """Modelo de Forecast basado en Promedio Móvil Ponderado"""

    def __init__(self, db_path: str = "../data/fluxion_production.db"):
        self.db_path = db_path
        self.conn = None

    def __enter__(self):
        self.conn = duckdb.connect(self.db_path)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()

    def get_forecast_params(self, ubicacion_id: str) -> Dict:
        """Obtiene parámetros de forecast para una ubicación"""
        query = """
        SELECT
            pmp_ventana_dias,
            pmp_peso_semana1,
            pmp_peso_semana2,
            pmp_peso_semana3,
            pmp_peso_semana4,
            ajuste_estacionalidad,
            ajuste_tendencia
        FROM forecast_params
        WHERE ubicacion_id = ?
        """
        result = self.conn.execute(query, [ubicacion_id]).fetchone()

        if result:
            return {
                "ventana_dias": result[0],
                "peso_s1": result[1],
                "peso_s2": result[2],
                "peso_s3": result[3],
                "peso_s4": result[4],
                "ajuste_estacional": result[5],
                "ajuste_tendencia": result[6],
            }
        else:
            # Parámetros por defecto
            return {
                "ventana_dias": 56,  # 8 semanas
                "peso_s1": 0.40,
                "peso_s2": 0.30,
                "peso_s3": 0.20,
                "peso_s4": 0.10,
                "ajuste_estacional": 1.0,
                "ajuste_tendencia": 1.0,
            }

    def calcular_forecast_diario(
        self,
        ubicacion_id: str,
        codigo_producto: str,
        dias_adelante: int = 7,
    ) -> List[Dict]:
        """
        Calcula forecast día por día

        Args:
            ubicacion_id: ID de la ubicación
            codigo_producto: Código del producto
            dias_adelante: Número de días a predecir

        Returns:
            Lista de forecasts, uno por cada día
        """
        params = self.get_forecast_params(ubicacion_id)

        # Query para obtener ventas DIARIAS de las últimas 8 semanas
        query = """
        WITH ventas_diarias AS (
            SELECT
                CAST(fecha AS DATE) as fecha,
                DAYOFWEEK(CAST(fecha AS DATE)) as dia_semana,
                SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_dia
            FROM ventas_raw
            WHERE ubicacion_id = ?
              AND codigo_producto = ?
              AND CAST(fecha AS DATE) >= CURRENT_DATE - INTERVAL '56 days'
              AND CAST(fecha AS DATE) < CURRENT_DATE
            GROUP BY CAST(fecha AS DATE), DAYOFWEEK(CAST(fecha AS DATE))
        ),
        promedios_por_dia_semana AS (
            SELECT
                dia_semana,
                AVG(cantidad_dia) as promedio_dia
            FROM ventas_diarias
            GROUP BY dia_semana
        )
        SELECT
            dia_semana,
            promedio_dia
        FROM promedios_por_dia_semana
        ORDER BY dia_semana
        """

        result = self.conn.execute(query, [ubicacion_id, codigo_producto]).fetchall()

        if not result:
            return []

        # Crear mapa de promedios por día de la semana (1=Lunes, 7=Domingo)
        promedios_dia_semana = {}
        for dia_semana, promedio_dia in result:
            promedios_dia_semana[dia_semana] = float(promedio_dia)

        # Calcular forecast para cada día
        forecasts_diarios = []
        hoy = datetime.now().date()

        # Obtener unidades por bulto
        query_bulto = """
        SELECT AVG(CAST(cantidad_bultos AS DECIMAL)) as unid_bulto
        FROM ventas_raw
        WHERE ubicacion_id = ?
          AND codigo_producto = ?
          AND CAST(cantidad_bultos AS DECIMAL) > 0
        LIMIT 1
        """
        bulto_result = self.conn.execute(query_bulto, [ubicacion_id, codigo_producto]).fetchone()
        unid_bulto = bulto_result[0] if bulto_result and bulto_result[0] else 1.0

        dias_semana_nombre = {
            1: 'Lunes',
            2: 'Martes',
            3: 'Miércoles',
            4: 'Jueves',
            5: 'Viernes',
            6: 'Sábado',
            7: 'Domingo'
        }

        for i in range(1, dias_adelante + 1):
            fecha_futura = hoy + timedelta(days=i)
            # DuckDB usa 1=Lunes, 7=Domingo (ISO)
            dia_semana = fecha_futura.isoweekday()

            # Obtener promedio para ese día de la semana
            forecast_unidades = promedios_dia_semana.get(dia_semana, 0.0)

            # Aplicar ajustes
            forecast_unidades *= float(params["ajuste_estacional"])
            forecast_unidades *= float(params["ajuste_tendencia"])

            forecast_bultos = forecast_unidades / float(unid_bulto) if unid_bulto > 0 else 0.0

            forecasts_diarios.append({
                "dia": i,
                "fecha": fecha_futura.isoformat(),
                "fecha_display": fecha_futura.strftime("%d/%m/%Y"),
                "dia_semana": dias_semana_nombre.get(dia_semana, ""),
                "forecast_unidades": round(forecast_unidades, 1),
                "forecast_bultos": round(forecast_bultos, 1),
            })

        return forecasts_diarios

    def calcular_forecast_producto(
        self,
        ubicacion_id: str,
        codigo_producto: str,
        fecha_forecast: Optional[str] = None,
        dias_adelante: int = 7,
    ) -> Dict:
        """
        Calcula forecast para un producto específico

        Args:
            ubicacion_id: ID de la ubicación
            codigo_producto: Código del producto
            fecha_forecast: Fecha desde la cual predecir (default: hoy)
            dias_adelante: Días a futuro (default: 7)

        Returns:
            Dict con forecast_unidades, forecast_bultos, fecha, etc.
        """
        if fecha_forecast is None:
            fecha_forecast = datetime.now().date()
        else:
            fecha_forecast = datetime.strptime(fecha_forecast, "%Y-%m-%d").date()

        params = self.get_forecast_params(ubicacion_id)

        # Query para obtener ventas semanales de las últimas 8 semanas
        query = """
        WITH semanas AS (
            SELECT
                DATE_TRUNC('week', CAST(fecha AS DATE)) as semana,
                SUM(CAST(cantidad_vendida AS DECIMAL)) as cantidad_semana
            FROM ventas_raw
            WHERE ubicacion_id = ?
              AND codigo_producto = ?
              AND CAST(fecha AS DATE) >= CURRENT_DATE - INTERVAL '56 days'
              AND CAST(fecha AS DATE) < CURRENT_DATE
            GROUP BY DATE_TRUNC('week', CAST(fecha AS DATE))
            ORDER BY semana DESC
            LIMIT 4
        )
        SELECT
            semana,
            cantidad_semana,
            cantidad_semana / 7.0 as promedio_diario
        FROM semanas
        ORDER BY semana DESC
        """

        result = self.conn.execute(query, [ubicacion_id, codigo_producto]).fetchall()

        if not result or len(result) < 2:
            # No hay suficientes datos históricos
            return {
                "forecast_unidades": 0.0,
                "forecast_bultos": 0.0,
                "forecast_min": 0.0,
                "forecast_max": 0.0,
                "error": "Insufficient historical data",
            }

        # Calcular promedio ponderado
        pesos = [params["peso_s1"], params["peso_s2"], params["peso_s3"], params["peso_s4"]]
        forecast_diario = 0.0

        for i, (semana, cantidad_semana, promedio_diario) in enumerate(result):
            if i < len(pesos):
                forecast_diario += float(promedio_diario) * float(pesos[i])

        # Aplicar ajustes
        forecast_diario *= float(params["ajuste_estacional"])
        forecast_diario *= float(params["ajuste_tendencia"])

        # Forecast para N días adelante
        forecast_unidades = forecast_diario * dias_adelante

        # Intervalo de confianza (±20% basado en CV observado)
        forecast_min = forecast_unidades * 0.80
        forecast_max = forecast_unidades * 1.20

        # Obtener unidades por bulto
        query_bulto = """
        SELECT AVG(CAST(cantidad_bultos AS DECIMAL)) as unid_bulto
        FROM ventas_raw
        WHERE ubicacion_id = ?
          AND codigo_producto = ?
          AND CAST(cantidad_bultos AS DECIMAL) > 0
        LIMIT 1
        """
        bulto_result = self.conn.execute(query_bulto, [ubicacion_id, codigo_producto]).fetchone()
        unid_bulto = bulto_result[0] if bulto_result and bulto_result[0] else 1.0

        forecast_bultos = forecast_unidades / unid_bulto if unid_bulto > 0 else 0.0

        return {
            "ubicacion_id": ubicacion_id,
            "codigo_producto": codigo_producto,
            "fecha_forecast": (fecha_forecast + timedelta(days=dias_adelante)).isoformat(),
            "fecha_calculo": datetime.now().isoformat(),
            "modelo": "PMP",
            "version_modelo": "v1.0",
            "forecast_unidades": round(forecast_unidades, 2),
            "forecast_bultos": round(forecast_bultos, 2),
            "forecast_min": round(forecast_min, 2),
            "forecast_max": round(forecast_max, 2),
            "ventana_dias": params["ventana_dias"],
            "peso_semana1": params["peso_s1"],
            "peso_semana2": params["peso_s2"],
            "peso_semana3": params["peso_s3"],
            "peso_semana4": params["peso_s4"],
            "semanas_historicas": len(result),
        }

    def calcular_forecast_tienda(
        self,
        ubicacion_id: str,
        productos: Optional[List[str]] = None,
        dias_adelante: int = 7,
    ) -> List[Dict]:
        """
        Calcula forecast para todos los productos de una tienda

        Args:
            ubicacion_id: ID de la ubicación
            productos: Lista de códigos de producto (None = todos)
            dias_adelante: Días a futuro

        Returns:
            Lista de dicts con forecasts por producto
        """
        # Si no se especifican productos, obtener los top 100 más vendidos
        if productos is None:
            query_top = """
            SELECT codigo_producto
            FROM ventas_raw
            WHERE ubicacion_id = ?
              AND CAST(fecha AS DATE) >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY codigo_producto
            ORDER BY SUM(CAST(cantidad_vendida AS DECIMAL)) DESC
            LIMIT 100
            """
            result = self.conn.execute(query_top, [ubicacion_id]).fetchall()
            productos = [row[0] for row in result]

        forecasts = []
        for codigo_producto in productos:
            try:
                forecast = self.calcular_forecast_producto(
                    ubicacion_id, codigo_producto, dias_adelante=dias_adelante
                )
                if forecast.get("forecast_unidades", 0) > 0:
                    forecasts.append(forecast)
            except Exception as e:
                print(f"Error forecasting {codigo_producto}: {e}")
                continue

        return forecasts

    def guardar_forecast(self, forecast: Dict) -> str:
        """Guarda un forecast en la base de datos"""
        forecast_id = str(uuid.uuid4())

        query = """
        INSERT INTO forecast_ventas (
            forecast_id,
            ubicacion_id,
            codigo_producto,
            fecha_forecast,
            fecha_calculo,
            modelo,
            version_modelo,
            forecast_unidades,
            forecast_bultos,
            forecast_min,
            forecast_max,
            ventana_dias,
            peso_semana1,
            peso_semana2,
            peso_semana3,
            peso_semana4
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        self.conn.execute(
            query,
            [
                forecast_id,
                forecast["ubicacion_id"],
                forecast["codigo_producto"],
                forecast["fecha_forecast"],
                forecast["fecha_calculo"],
                forecast["modelo"],
                forecast["version_modelo"],
                forecast["forecast_unidades"],
                forecast["forecast_bultos"],
                forecast["forecast_min"],
                forecast["forecast_max"],
                forecast["ventana_dias"],
                forecast["peso_semana1"],
                forecast["peso_semana2"],
                forecast["peso_semana3"],
                forecast["peso_semana4"],
            ],
        )
        self.conn.commit()

        return forecast_id

    def obtener_forecast(
        self,
        ubicacion_id: str,
        codigo_producto: Optional[str] = None,
        fecha_desde: Optional[str] = None,
    ) -> List[Dict]:
        """
        Obtiene forecasts guardados de la base de datos

        Args:
            ubicacion_id: ID de la ubicación
            codigo_producto: Código del producto (None = todos)
            fecha_desde: Fecha mínima de forecast (None = hoy)

        Returns:
            Lista de forecasts
        """
        if fecha_desde is None:
            fecha_desde = datetime.now().date().isoformat()

        query = """
        SELECT
            forecast_id,
            ubicacion_id,
            codigo_producto,
            fecha_forecast,
            fecha_calculo,
            modelo,
            forecast_unidades,
            forecast_bultos,
            forecast_min,
            forecast_max
        FROM forecast_ventas
        WHERE ubicacion_id = ?
          AND fecha_forecast >= ?
        """

        params = [ubicacion_id, fecha_desde]

        if codigo_producto:
            query += " AND codigo_producto = ?"
            params.append(codigo_producto)

        query += " ORDER BY fecha_forecast ASC, codigo_producto ASC"

        result = self.conn.execute(query, params).fetchall()

        forecasts = []
        for row in result:
            forecasts.append({
                "forecast_id": row[0],
                "ubicacion_id": row[1],
                "codigo_producto": row[2],
                "fecha_forecast": row[3],
                "fecha_calculo": row[4],
                "modelo": row[5],
                "forecast_unidades": row[6],
                "forecast_bultos": row[7],
                "forecast_min": row[8],
                "forecast_max": row[9],
            })

        return forecasts


# ============================================
# CLI para testing
# ============================================
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Uso: python3 forecast_pmp.py <ubicacion_id> <codigo_producto>")
        print("Ejemplo: python3 forecast_pmp.py tienda_01 000658")
        sys.exit(1)

    ubicacion_id = sys.argv[1]
    codigo_producto = sys.argv[2]

    with ForecastPMP() as forecaster:
        print(f"\n🔮 Calculando forecast para {codigo_producto} en {ubicacion_id}...")
        forecast = forecaster.calcular_forecast_producto(ubicacion_id, codigo_producto)

        print("\n📊 Resultado:")
        print(f"  Fecha forecast: {forecast.get('fecha_forecast')}")
        print(f"  Modelo: {forecast.get('modelo')} {forecast.get('version_modelo')}")
        print(f"  Forecast: {forecast.get('forecast_unidades')} unidades")
        print(f"  Forecast: {forecast.get('forecast_bultos')} bultos")
        print(f"  Intervalo: [{forecast.get('forecast_min')}, {forecast.get('forecast_max')}] unidades")
        print(f"  Semanas históricas: {forecast.get('semanas_historicas')}")

        if forecast.get("error"):
            print(f"\n⚠️  Error: {forecast.get('error')}")
