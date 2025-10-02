# Instrucciones para Extraer Data de Gaps Identificados

## Script Recomendado: `etl/archive/etl_ventas_multi_tienda.py`

**Razón**: Tiene todas las dependencias disponibles y funciona correctamente.

**IMPORTANTE**: Todos los comandos deben ejecutarse desde el directorio `etl/archive/`

## Gaps Identificados y Comandos de Extracción

### 1. tienda_08 - Marzo 2025 (31 días faltantes)

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/archive
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_08 \
  --fecha-inicio 2025-03-01 \
  --fecha-fin 2025-03-31 \
  --limite 1000000
```

**Ubicación**: BOSQUE

---

### 2. tienda_13 - Julio 2025 (31 días faltantes)

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/archive
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_13 \
  --fecha-inicio 2025-07-01 \
  --fecha-fin 2025-07-31 \
  --limite 1000000
```

**Ubicación**: NAGUANAGUA III

---

### 3. tienda_16 - Junio-Julio 2025 (61 días faltantes)

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/archive
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_16 \
  --fecha-inicio 2025-06-01 \
  --fecha-fin 2025-07-31 \
  --limite 2000000
```

**Ubicación**: SABANA LARGA

---

### 4. tienda_01 - Febrero 9-10 2025 (2 días faltantes)

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/archive
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-02-09 \
  --fecha-fin 2025-02-10 \
  --limite 100000
```

**Ubicación**: VALENCIA CENTRO

---

## Ejecutar Todos los Gaps en Secuencia

Si prefieres ejecutarlos todos de una vez, guarda esto como `extraer_todos_gaps.sh`:

```bash
#!/bin/bash
# extraer_todos_gaps.sh

cd /Users/jose/Developer/fluxion-workspace/etl/archive

echo "=== Extrayendo Gap 1/4: tienda_08 Marzo 2025 ==="
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_08 \
  --fecha-inicio 2025-03-01 \
  --fecha-fin 2025-03-31 \
  --limite 1000000

echo ""
echo "=== Extrayendo Gap 2/4: tienda_13 Julio 2025 ==="
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_13 \
  --fecha-inicio 2025-07-01 \
  --fecha-fin 2025-07-31 \
  --limite 1000000

echo ""
echo "=== Extrayendo Gap 3/4: tienda_16 Junio-Julio 2025 ==="
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_16 \
  --fecha-inicio 2025-06-01 \
  --fecha-fin 2025-07-31 \
  --limite 2000000

echo ""
echo "=== Extrayendo Gap 4/4: tienda_01 Febrero 9-10 2025 ==="
python3 etl_ventas_multi_tienda.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-02-09 \
  --fecha-fin 2025-02-10 \
  --limite 100000

echo ""
echo "=== Extracción Completada ==="
echo "Ejecuta 'python3 ../analyze_data_gaps.py' para verificar resultados"
```

Ejecútalo con:

```bash
chmod +x extraer_todos_gaps.sh
./extraer_todos_gaps.sh
```

---

## Verificar Éxito de la Extracción

Después de ejecutar los ETLs, verifica que los datos se cargaron:

```bash
cd /Users/jose/Developer/fluxion-workspace
python3 analyze_data_gaps.py
```

Esto regenerará los gráficos y mostrará:
- Si los gaps desaparecieron
- Nueva cobertura temporal por tienda
- Gráficos actualizados (PNG files)

---

## Ver el Help del Script

Para ver todas las opciones disponibles:

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/archive
python3 etl_ventas_multi_tienda.py --help
```

---

## Monitoreo Durante la Ejecución

El script `etl_ventas_multi_tienda.py` muestra progreso en tiempo real:

```
🏪 Procesando ventas: BOSQUE
   📡 Conectando a 192.168.1.10:1433
   📅 Período: 2025-03-01 a 2025-03-31
   🔢 Límite: 1,000,000 registros
   ✅ ETL completado para BOSQUE
   📥 Extraídos: 234,567
   🔄 Transformados: 234,567
   💾 Cargados: 234,567
   ⏱️  Tiempo: 45.32s
```

---

## Notas Importantes

1. **Fuente de Datos**: El script se conecta a servidores SQL Server remotos. Asegúrate de que:
   - Las IPs están configuradas en `tiendas_config.py`
   - Los servidores están accesibles desde tu red
   - Las credenciales están en el archivo `.env`

2. **Credenciales**: Verifica el archivo `etl/.env`:
   ```
   SQL_SERVER_USER=tu_usuario
   SQL_SERVER_PASSWORD=tu_password
   ```

3. **Espacio en Disco**: Con ~125 días de gaps, espera procesar entre 15-30 millones de registros adicionales (~2-3 GB)

4. **Tiempo Estimado**:
   - tienda_01 (2 días): ~30 segundos
   - tienda_08 (31 días): ~8-10 minutos
   - tienda_13 (31 días): ~8-10 minutos
   - tienda_16 (61 días): ~15-20 minutos
   - **Total**: ~30-45 minutos

5. **Backup**: Siempre es bueno tener un backup de `data/fluxion_production.db` antes:
   ```bash
   cp data/fluxion_production.db data/fluxion_production_backup_$(date +%Y%m%d_%H%M%S).db
   ```

---

## Orden Recomendado de Ejecución

1. **Primero**: tienda_01 (2 días) - Gap más pequeño para probar conectividad
2. **Segundo**: tienda_08 (31 días) - Gap mediano
3. **Tercero**: tienda_13 (31 días) - Gap mediano
4. **Cuarto**: tienda_16 (61 días) - Gap más grande

Esto te permite detectar problemas temprano sin procesar grandes volúmenes de datos.

---

## Troubleshooting

### Error: "No module named 'etl_ventas'"
**Solución**: Asegúrate de ejecutar desde `etl/archive/`:
```bash
cd /Users/jose/Developer/fluxion-workspace/etl/archive
python3 etl_ventas_multi_tienda.py ...
```

### Error: "Connection timeout"
**Solución**: Verifica conectividad con:
```bash
cd /Users/jose/Developer/fluxion-workspace/etl/archive
python3 ../core/verificar_conectividad.py
```

### Error: "Login failed for user"
**Solución**: Verifica credenciales en `etl/.env`

### El script se ejecuta pero no hay datos
**Solución**: Es posible que esos períodos realmente no tengan datos en el sistema fuente. Verifica logs del script para más detalles.
