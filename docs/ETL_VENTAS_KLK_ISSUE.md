# ETL Ventas KLK - Problema Identificado

**Fecha**: 2025-11-24
**Status**: 🔴 CRÍTICO - ETL ventas no funciona para tiendas KLK

---

## 🔍 Problema

El ETL de ventas **NO distingue entre tiendas KLK y Stellar**. Siempre intenta conectarse a SQL Server (Stellar) independientemente del campo `sistema_pos` en la configuración.

### Error Observado

```bash
curl -X POST 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/sync/ventas' \
  -H 'Content-Type: application/json' \
  -d '{
    "ubicacion_id": "tienda_01",
    "fecha_inicio": "2025-10-01",
    "fecha_fin": "2025-10-10"
  }'
```

**Logs de CloudWatch**:
```
🚀 Extracción con pyodbc simple (como inventario ETL)
📡 192.168.20.12:14348
❌ Error conectando a PERIFERICO: ('08001', '[08001] [Microsoft][ODBC Driver 18 for SQL Server]TCP Provider: Error code 0x68 (104) (SQLDriverConnect)')
```

**Problema**: tienda_01 (PERIFERICO) tiene `sistema_pos="klk"` y **NO debe conectarse a SQL Server**. Debe usar la REST API de KLK.

---

## 🔎 Análisis Técnico

### Comparación: Inventario vs Ventas

#### ETL Inventario (✅ FUNCIONA CORRECTAMENTE)

**Archivo**: [etl/etl_inventario.py:111-119](etl/etl_inventario.py#L111-L119)

```python
def ejecutar_etl_tienda(self, tienda_id: str, ...):
    sistema_pos = getattr(config, 'sistema_pos', 'stellar')

    if sistema_pos == 'klk':
        logger.info(f"🏪 Procesando: {config.ubicacion_nombre} (KLK POS)")
        return self._ejecutar_etl_klk(tienda_id, config, ...)
    else:
        logger.info(f"🏪 Procesando: {config.ubicacion_nombre} (Stellar POS)")
        return self._ejecutar_etl_stellar(tienda_id, config, ...)
```

**Resultado**: ✅ Inventario funciona perfecto para tiendas KLK

---

#### ETL Ventas (❌ NO FUNCIONA)

**Archivo**: [etl/core/etl_ventas.py:40-103](etl/core/etl_ventas.py#L40-L103)

```python
def ejecutar_etl_ventas(self, tienda_id: str, fecha_inicio, fecha_fin, ...):
    config = TIENDAS_CONFIG[tienda_id]

    # ❌ NO verifica sistema_pos
    # ❌ Siempre usa VentasExtractor que conecta a SQL Server

    raw_data = self.extractor.extract_ventas_data(
        config=db_config,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        limite_registros=limite_registros
    )
```

**Archivo**: [etl/core/extractor_ventas.py:167-172](etl/core/extractor_ventas.py#L167-L172)

```python
def extract_ventas_data(self,
                       config,
                       fecha_inicio: date,
                       fecha_fin: date,
                       limite_registros: int = None,
                       query_file: str = "query_ventas_generic.sql"):  # ❌ HARDCODED Stellar
```

**Resultado**: ❌ Ventas solo funciona para Stellar, no para KLK

---

## 🛠️ Solución Requerida

### Opción 1: Implementar Dual-Path en ETL Ventas (RECOMENDADA)

Modificar `etl/core/etl_ventas.py` para que funcione igual que el ETL de inventario:

```python
class VentasETL:
    def __init__(self):
        # Stellar components (existentes)
        self.stellar_extractor = VentasExtractor()
        self.stellar_transformer = VentasTransformer()

        # KLK components (NUEVO)
        from extractor_ventas_klk import VentasKLKExtractor
        from transformer_ventas_klk import VentasKLKTransformer
        self.klk_extractor = VentasKLKExtractor()
        self.klk_transformer = VentasKLKTransformer()

        # Shared loader
        self.loader = VentasLoader()

    def ejecutar_etl_ventas(self, tienda_id, fecha_inicio, fecha_fin, ...):
        config = TIENDAS_CONFIG[tienda_id]
        sistema_pos = getattr(config, 'sistema_pos', 'stellar')

        if sistema_pos == 'klk':
            return self._ejecutar_etl_ventas_klk(tienda_id, config, ...)
        else:
            return self._ejecutar_etl_ventas_stellar(tienda_id, config, ...)

    def _ejecutar_etl_ventas_stellar(self, ...):
        # Lógica actual (SQL Server)
        raw_data = self.stellar_extractor.extract_ventas_data(...)
        transformed = self.stellar_transformer.transform_ventas_data(raw_data)
        ...

    def _ejecutar_etl_ventas_klk(self, ...):
        # Nueva lógica (REST API KLK)
        raw_data = self.klk_extractor.extract_ventas_data_from_api(...)
        transformed = self.klk_transformer.transform_ventas_data(raw_data)
        ...
```

**Archivos a crear**:
- `etl/core/extractor_ventas_klk.py` - Extractor que usa la REST API de KLK
- `etl/core/transformer_ventas_klk.py` - Transformer para formato de API KLK (puede ya existir)

**Archivos a modificar**:
- `etl/core/etl_ventas.py` - Agregar lógica dual-path

---

### Opción 2: Workaround Temporal (MÁS RÁPIDO)

Modificar el endpoint de backend para rechazar tiendas KLK hasta que se implemente la solución:

```python
# backend/main.py - línea ~3478
@app.post("/api/etl/sync/ventas", tags=["ETL"])
async def trigger_ventas_etl_sync(request: VentasETLSyncRequest, ...):
    # TEMPORAL: Validar que no sea tienda KLK
    if request.ubicacion_id:
        from backend.tiendas_config import TIENDAS_CONFIG
        config = TIENDAS_CONFIG.get(request.ubicacion_id)
        if config and getattr(config, 'sistema_pos', 'stellar') == 'klk':
            raise HTTPException(
                status_code=501,
                detail=f"ETL de ventas no soporta tiendas KLK aún. Use ETL de inventario para tiendas KLK."
            )

    # ... resto del código
```

**Ventaja**: Evita errores confusos
**Desventaja**: No soluciona el problema real

---

## 📊 Estado de Componentes KLK

### Inventario (✅ COMPLETO)

- ✅ `etl/core/extractor_inventario_klk.py` - Extractor REST API
- ✅ `etl/core/transformer_inventario_klk.py` - Transformer
- ✅ `etl/etl_inventario.py` - Orquestador con dual-path
- ✅ `etl/core/etl_inventario_klk.py` - Script standalone
- ✅ Cron jobs configurados para actualización cada 30 min

**Resultado**: Inventario KLK funciona perfectamente en producción

### Ventas (❌ INCOMPLETO)

- ❓ `etl/core/extractor_ventas_klk.py` - **¿EXISTE?**
- ✅ `etl/core/transformer_ventas_klk.py` - Ya existe (usado por inventario cron)
- ❌ `etl/core/etl_ventas.py` - **NO tiene dual-path**
- ❓ `etl/core/etl_ventas_klk.py` - **¿EXISTE?**

**Resultado**: Ventas KLK NO funciona

---

## 🎯 Plan de Acción Recomendado

### Paso 1: Verificar Componentes Existentes
```bash
ls -la etl/core/*ventas*klk*
```

Si `extractor_ventas_klk.py` ya existe, adaptar su código para ventas.

### Paso 2: Implementar Dual-Path

1. Crear `etl/core/extractor_ventas_klk.py` (o adaptar existente)
2. Verificar `etl/core/transformer_ventas_klk.py` funcione para ventas
3. Modificar `etl/core/etl_ventas.py` con lógica `if sistema_pos == 'klk'`

### Paso 3: Testing Local

```bash
# Test con tienda KLK (PERIFERICO)
cd etl
python3 core/etl_ventas.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-03

# Verificar que use API REST y NO SQL Server
```

### Paso 4: Deploy a Producción

```bash
git add etl/core/
git commit -m "feat: agregar soporte KLK en ETL de ventas (dual-path Stellar/KLK)"
git push origin main
```

### Paso 5: Ejecutar ETL Ventas KLK

```bash
# Ejecutar para las 5 tiendas KLK
curl -X POST 'https://d1tgnaj74tv17v.cloudfront.net/api/etl/sync/ventas' \
  -H 'Content-Type: application/json' \
  -d '{"ubicacion_id": "tienda_01", "fecha_inicio": "2025-10-01", "fecha_fin": "2025-10-10"}'

# Repetir para: tienda_08, tienda_17, tienda_18, tienda_20
```

---

## 🏪 Tiendas KLK (Afectadas)

| Tienda ID | Nombre | Sistema POS | Estado ETL Ventas |
|-----------|--------|-------------|-------------------|
| tienda_01 | PERIFERICO | klk | ❌ No funciona |
| tienda_08 | EL BOSQUE | klk | ❌ No funciona |
| tienda_17 | ARTIGAS | klk | ❌ No funciona |
| tienda_18 | PARAISO | klk | ❌ No funciona |
| tienda_20 | TAZAJAL | klk | ❌ No funciona |

---

## 📝 Notas Adicionales

### ¿Por qué funciona Inventario pero no Ventas?

El ETL de **inventario** fue actualizado recientemente (nov 2025) para soportar ambos sistemas (Stellar y KLK) con arquitectura dual-path.

El ETL de **ventas** es más antiguo y nunca fue actualizado con la misma arquitectura.

### ¿Se puede usar el ETL de inventario como referencia?

✅ **SÍ**, el código de `etl/etl_inventario.py` es la referencia perfecta para implementar el mismo patrón en ventas.

### Estimación de Tiempo

- **Implementar dual-path**: 2-3 horas
- **Testing local**: 1 hora
- **Deploy y validación**: 30 minutos
- **Ejecutar 5 tiendas**: 10 minutos

**Total**: ~4 horas de desarrollo

---

## 🔗 Referencias

- [etl/etl_inventario.py:111-119](etl/etl_inventario.py#L111-L119) - Dual-path reference
- [etl/core/extractor_inventario_klk.py](etl/core/extractor_inventario_klk.py) - KLK API extractor example
- [backend/tiendas_config.py](backend/tiendas_config.py) - Store configuration with `sistema_pos`
- [docs/CRON_KLK_REALTIME.md](docs/CRON_KLK_REALTIME.md) - KLK cron jobs (inventario only)
