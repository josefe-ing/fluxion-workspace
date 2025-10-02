# Estructura del Directorio ETL

## 📁 Organización de Archivos

```
etl/
├── core/                          # 🔧 Archivos principales activos
│   ├── etl_ventas_historico.py   # Script principal de migración
│   ├── ver_estado_ventas.py      # Verificación de estado
│   ├── tiendas_config.py         # Configuración de tiendas
│   └── config.py                 # Configuración general
│
├── scripts/                       # 📜 Scripts de soporte
│   ├── query_ventas_generic.sql  # Query base para ventas
│   ├── query_inventario_generic.sql # Query base para inventario
│   ├── requirements.txt          # Dependencias Python
│   └── install_dependencies.sh   # Instalador de dependencias
│
├── docs/                          # 📚 Documentación
│   ├── ETL_VENTAS_README.md      # Guía principal del ETL
│   ├── ESTRUCTURA.md             # Este archivo
│   ├── README_old.md             # README anterior
│   ├── ETL_INVENTARIO_GUIA.md    # Guía de inventario
│   └── ETL_PROGRESO.md           # Notas de progreso
│
├── archive/                       # 🗄️ Archivos obsoletos
│   ├── etl_ventas.py             # Versión anterior del ETL
│   ├── etl_ventas_multi_tienda.py # Versión multi-tienda anterior
│   ├── loader_ventas.py          # Componente loader separado
│   ├── extractor_ventas.py       # Componente extractor separado
│   ├── transformer_ventas.py     # Componente transformer separado
│   └── [otros archivos antiguos]
│
├── reports/                       # 📊 Reportes generados
│   ├── reporte_ventas_historico_*.json # Reportes de migración
│   └── reporte_ventas_multi_tienda_*.txt # Reportes antiguos
│
├── temp/                          # 🗂️ Archivos temporales
│   └── la_granja_etl.duckdb      # BD de prueba
│
├── logs/                          # 📝 Logs del sistema
│   └── [logs automáticos]
│
├── _backup_cleanup/               # 🗃️ Backups antiguos (a eliminar)
│   ├── tests/
│   ├── debug/
│   └── obsoletos/
│
└── .env                          # 🔐 Variables de entorno
```

## 🎯 Uso de Cada Directorio

### `core/` - Archivos Principales
- **Solo archivos activos y en uso**
- **Scripts de producción**
- **Configuraciones actuales**

### `scripts/` - Herramientas de Soporte
- **Queries SQL**
- **Scripts de instalación**
- **Utilidades auxiliares**

### `docs/` - Documentación
- **Guías de uso**
- **Documentación técnica**
- **Notas de versiones**

### `archive/` - Código Obsoleto
- **Versiones anteriores**
- **Código experimental**
- **Mantener para referencia histórica**

### `reports/` - Reportes
- **Salidas de procesos ETL**
- **Logs de migración**
- **Archivos de auditoría**

### `temp/` - Temporales
- **Archivos de prueba**
- **Bases de datos temporales**
- **Cache y trabajos en curso**

## 🚀 Comandos Actualizados

### Desde el directorio etl/

```bash
# Verificar estado
python3 core/ver_estado_ventas.py

# Ejecutar ETL
python3 core/etl_ventas_historico.py --fecha-inicio 2024-01-01 --fecha-fin 2024-01-31 --tiendas tienda_01

# Instalar dependencias
bash scripts/install_dependencies.sh
```

## 🧹 Limpieza Recomendada

### Archivos a Eliminar (después de backup)
```bash
# Eliminar backup antiguo (después de verificar que no se necesita)
rm -rf _backup_cleanup/

# Limpiar reportes antiguos (más de 30 días)
find reports/ -name "reporte_*.json" -mtime +30 -delete

# Limpiar temporales
rm -rf temp/*
```

### Mantenimiento Regular
```bash
# Revisar tamaño de reports/ mensualmente
du -sh reports/

# Archivar reportes antiguos
tar -czf reports_$(date +%Y%m).tar.gz reports/reporte_*_$(date +%Y%m)*.json
```

---
**Fecha**: 2025-09-30
**Reorganizado por**: Claude Code ETL Cleanup