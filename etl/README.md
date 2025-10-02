# ETL Fluxion AI - Sistema de Migración de Datos

## 🚀 Inicio Rápido

```bash
# 1. SIEMPRE verificar conectividad primero
python3 core/test_conectividad_simple.py

# 2. Verificar estado de datos actual
python3 core/ver_estado_ventas.py

# 3. Ejecutar migración mensual
python3 core/etl_ventas_historico.py \
  --fecha-inicio 2024-08-01 \
  --fecha-fin 2024-08-31 \
  --tiendas tienda_01 tienda_02 \
  --secuencial
```

## 📊 Estado Actual

- **81.8M registros** migrados exitosamente (sin mayorista_01)
- **13 meses** de datos (Sep 2024 - Sep 2025)
- **16 tiendas activas** con datos históricos
- **7 tiendas** con cobertura completa (100%)

## 📁 Estructura

```
├── core/           # Scripts principales
├── scripts/        # Herramientas de soporte
├── docs/           # Documentación completa
├── archive/        # Código obsoleto
├── reports/        # Reportes generados
└── temp/           # Archivos temporales
```

## 📚 Documentación

- **[Guía Principal](docs/ETL_VENTAS_README.md)** - Documentación completa
- **[Estructura](docs/ESTRUCTURA.md)** - Organización de archivos
- **[Progreso](docs/ETL_PROGRESO.md)** - Historial de cambios

## 🏪 Tiendas Top por Volumen

1. **tienda_01** (PERIFERICO): 9.7M registros
2. **tienda_11** (FLOR AMARILLO): 8.1M registros
3. **tienda_12** (PARAPARAL): 6.8M registros
4. **tienda_04** (SAN DIEGO): 6.5M registros
5. **tienda_09** (GUACARA): 5.9M registros

## ⚙️ Configuración

```bash
# Instalar dependencias
bash scripts/install_dependencies.sh

# Configurar variables de entorno
cp .env.example .env  # Editar con tus credenciales
```

## 🔧 Mantenimiento

```bash
# Verificar conectividad antes de ETL
python3 core/test_conectividad_simple.py

# Limpiar reportes antiguos
find reports/ -name "*.json" -mtime +30 -delete

# Verificar integridad de datos
python3 core/ver_estado_ventas.py
```

---
**Sistema ETL Fluxion AI** | Última actualización: 2025-09-30