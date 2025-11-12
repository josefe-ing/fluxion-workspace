# Guía de Uso: Sistema de Alertas de Reclasificación

## 🎉 ¡Sistema Completado!

Se ha implementado un sistema completo de tracking y alertas para cambios en clasificaciones ABC-XYZ.

---

## 📍 Acceso al Sistema

### URL del Dashboard de Alertas

```
http://localhost:3001/administrador/alertas
```

O desde el menú de navegación:
**Administrador → Alertas de Reclasificación**

---

## 🚀 Cómo Usar

### 1. **Ejecutar Cálculo ABC-XYZ (Primera Vez)**

Para generar datos y que el histórico comience a funcionar:

```bash
# Desde la raíz del proyecto
cd database

# Ejecutar cálculo ABC (toma ~1-2 minutos)
python3 calcular_abc_v2_por_tienda.py --verbose

# Ejecutar cálculo XYZ (toma ~1-2 minutos)
python3 calcular_xyz_por_tienda.py --verbose
```

**Nota**: La primera ejecución NO mostrará cambios (es normal, no hay histórico previo).

### 2. **Generar Cambios de Prueba (Segunda Ejecución)**

Espera 1 día o ejecuta nuevamente para ver cambios:

```bash
# Segunda ejecución - Ahora SÍ detectará cambios
python3 calcular_abc_v2_por_tienda.py --verbose
python3 calcular_xyz_por_tienda.py --verbose
```

**Salida esperada**:
```
📦 Archivando clasificaciones antiguas...
📦 31,773 registros archivados en histórico

[... cálculos ...]

🔍 Detectando cambios de clasificación...

🔔 CAMBIOS DE CLASIFICACIÓN DETECTADOS: 45
======================================================================
   🔴 Cambios críticos: 3
   🔴 PROD-12345        [tienda_01]: A → C (-45.2%)
   🟡 PROD-67890        [tienda_02]: B → A (+28.5%)
   ... y 42 cambios más
```

### 3. **Ver Alertas en el Dashboard**

1. Abre el frontend: http://localhost:3001
2. Inicia sesión
3. Ve a **Administrador → Alertas de Reclasificación**

#### Funcionalidades del Dashboard:

**Filtros disponibles**:
- ✅ Período (7, 15, 30, 90 días)
- ✅ Tienda específica
- ✅ Solo pendientes
- ✅ Solo críticas

**Información mostrada**:
- 📊 Estadísticas generales (total, críticas, pendientes)
- 🏪 Resumen por tienda
- 📋 Lista de alertas con detalle
- 🎯 Nivel de prioridad (ALTA, MEDIA, BAJA)
- 📈 Cambio porcentual de valor
- 🔄 Cambio de matriz ABC-XYZ

**Acciones disponibles**:
- 👁️ Ver detalle de cada alerta
- ✅ Marcar como revisada (con notas)
- 📝 Agregar comentarios

### 4. **Ver Histórico de un Producto**

Desde el dashboard de productos:

1. Ve a **Productos**
2. Busca un producto
3. Click en "Ver Histórico de Clasificación"
4. Se abrirá el modal con:
   - Clasificación actual (ABC, XYZ, Matriz)
   - Histórico de cambios
   - Fechas de cada cambio

---

## 🔄 Automatización (Recomendado)

### Configurar Cron Job para Ejecución Diaria

Crea el script `ejecutar_abc_xyz.sh`:

```bash
#!/bin/bash

cd /path/to/fluxion-workspace/database

echo "==================================================="
echo "$(date): Iniciando cálculo ABC-XYZ"
echo "==================================================="

# Ejecutar ABC
python3 calcular_abc_v2_por_tienda.py --verbose

# Ejecutar XYZ
python3 calcular_xyz_por_tienda.py --verbose

echo "==================================================="
echo "$(date): Proceso completado"
echo "==================================================="
```

Haz el script ejecutable:
```bash
chmod +x ejecutar_abc_xyz.sh
```

Agrega al crontab (todos los días a las 3 AM):
```bash
crontab -e

# Agregar línea:
0 3 * * * /path/to/fluxion-workspace/database/ejecutar_abc_xyz.sh >> /path/to/logs/abc-xyz.log 2>&1
```

---

## 📊 Tipos de Alertas

### 🔴 **ALTA Prioridad** (Requiere acción inmediata)

- **A → C**: Producto de alto valor cayó drásticamente
  - **Acción**: Revisar causa. ¿Es estacional? ¿Descontinuado? ¿Problema de calidad?

- **C → A**: Producto de bajo valor ahora es crítico
  - **Acción**: Aumentar stock de seguridad. Revisar abastecimiento.

- **X → Z (en productos A)**: Demanda estable se volvió errática
  - **Acción**: Aumentar stock de seguridad o analizar patrones estacionales.

### 🟡 **MEDIA Prioridad** (Revisar pronto)

- **A → B** o **B → A**: Cambios entre clases adyacentes
  - **Acción**: Ajustar parámetros de inventario gradualmente.

- **Y → X** o **Y → Z**: Cambios de volatilidad moderados
  - **Acción**: Monitorear y ajustar según tendencia.

### 🟢 **BAJA Prioridad** (Informativo)

- **B → C** o **C → B**: Cambios en productos no críticos
  - **Acción**: Opcional. Revisar en análisis mensual.

---

## 📱 Interfaz del Dashboard

### Vista Principal

```
┌─────────────────────────────────────────────────────────┐
│  🚨 ALERTAS DE RECLASIFICACIÓN                         │
│                                                         │
│  📊 Estadísticas                                        │
│  ┌────────┬─────────┬──────────┬───────────┬──────────┤
│  │ Total  │ Críticas│ Alta Pri │ Pendientes│ ABC  XYZ │
│  │   45   │    3    │    15    │     38    │  28   17 │
│  └────────┴─────────┴──────────┴───────────┴──────────┘
│                                                         │
│  🔍 Filtros                                             │
│  [Período: 7 días ▾] [Tienda: Todas ▾]                │
│  ☑ Solo pendientes   ☑ Solo críticas                   │
│                                                         │
│  📋 Alertas (45)                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 🔴 ARROZ DIANA 1KG              [ALTA] CRÍTICO  │  │
│  │    Granos • tienda_01                           │  │
│  │    A → C | -45.2% | AX → CZ                     │  │
│  │    [Ver detalle]                                 │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 🟡 ACEITE MARIA 1L              [MEDIA]         │  │
│  │    Aceites • tienda_02                          │  │
│  │    B → A | +28.5% | BY → AY                     │  │
│  │    [Ver detalle]                                 │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Modal de Detalle

```
┌──────────────────────────────────────────────┐
│  Detalle de Alerta                      [X]  │
├──────────────────────────────────────────────┤
│                                              │
│  📦 Producto                                  │
│  ARROZ DIANA 1KG                             │
│  Código: PROD-12345                          │
│  Granos • Marca Diana                        │
│  Tienda: tienda_01                           │
│                                              │
│  🔄 Cambio Detectado                         │
│  Clasificación: A → C                        │
│  Matriz ABC-XYZ: AX → CZ                     │
│  Variación de valor: -45.23%                 │
│  Fecha: 12/11/2025 10:30                     │
│                                              │
│  💡 Acción Recomendada                       │
│  Revisar causa de caída en ventas.           │
│  Verificar si es estacional o permanente.    │
│  Considerar ajustar inventario.              │
│                                              │
│  📝 Notas de Revisión                        │
│  ┌────────────────────────────────────────┐ │
│  │ [Escribe tus notas aquí...]           │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  [Cerrar] [Marcar como Revisada]             │
└──────────────────────────────────────────────┘
```

---

## 🧪 Probar el Sistema

### Opción 1: Ejecutar Scripts Manualmente

```bash
# Terminal 1: Backend
cd backend
python3 start.py

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Ejecutar cálculos
cd database
python3 calcular_abc_v2_por_tienda.py --verbose
python3 calcular_xyz_por_tienda.py --verbose

# Esperar ~2-4 minutos, luego ejecutar de nuevo
python3 calcular_abc_v2_por_tienda.py --verbose
python3 calcular_xyz_por_tienda.py --verbose
```

### Opción 2: Probar API Directamente

```bash
# Ver alertas
curl http://localhost:8001/api/alertas/cambios-clasificacion

# Ver resumen por tiendas
curl http://localhost:8001/api/alertas/resumen-tiendas

# Ver histórico de un producto
curl http://localhost:8001/api/productos/PROD-123/historico-abc-xyz
```

---

## 🎯 Flujo de Trabajo Recomendado

### Diario (Automático)

1. **3:00 AM** - Cron job ejecuta cálculo ABC-XYZ
2. **8:00 AM** - Gerente revisa alertas pendientes
3. **Durante el día** - Acciones correctivas según prioridad
4. **EOD** - Marcar alertas revisadas con notas

### Semanal (Manual)

1. Revisar productos con múltiples cambios (volátiles)
2. Analizar tendencias por tienda
3. Ajustar parámetros de inventario
4. Exportar reporte de cambios

### Mensual (Estratégico)

1. Análisis de estabilidad del catálogo
2. Identificar productos problemáticos
3. Decisiones de descontinuación/promoción
4. Planificación de compras

---

## 📈 Métricas de Éxito

El sistema te permitirá medir:

- **Tiempo de respuesta**: ¿Cuánto tardan en revisar alertas críticas?
- **Estabilidad**: ¿Cuántos productos cambian de clase cada semana?
- **Eficiencia**: ¿Las acciones correctivas están funcionando?
- **Cobertura**: ¿Todas las tiendas están siendo monitoreadas?

---

## 🐛 Troubleshooting

### No aparecen alertas

**Causa**: Primera ejecución o no hay cambios reales.

**Solución**: Ejecuta el cálculo 2 veces para generar histórico.

### Error en el dashboard

**Causa**: Backend no está corriendo o hay error en la BD.

**Solución**:
```bash
# Verificar backend
curl http://localhost:8001/api/alertas/cambios-clasificacion

# Verificar tabla
python3 -c "
import duckdb
conn = duckdb.connect('data/fluxion_production.db')
print(conn.execute('SELECT COUNT(*) FROM alertas_cambio_clasificacion').fetchone())
"
```

### Scripts muy lentos

**Causa**: Base de datos muy grande.

**Solución**: Los scripts ya están optimizados. El tiempo normal es 2-5 minutos.

---

## 📞 Soporte

- **Documentación técnica**: [SISTEMA_HISTORICO_CLASIFICACIONES.md](SISTEMA_HISTORICO_CLASIFICACIONES.md)
- **Código fuente**:
  - Backend: `/backend/main.py` (líneas 4635+)
  - Frontend: `/frontend/src/components/admin/AlertasReclasificacion.tsx`
  - Scripts: `/database/calcular_*_por_tienda.py`

---

**¡Listo para usar!** 🎉

El sistema está completamente funcional y listo para producción.
