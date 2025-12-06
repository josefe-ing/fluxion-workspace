---
sidebar_position: 2
title: Centro de Control ETL
---

# Centro de Control ETL

Monitorea y controla los procesos de sincronización de datos entre tu sistema fuente (ERP) y Fluxion AI.

## ¿Qué es ETL?

**ETL** significa Extracción, Transformación y Carga:

1. **Extracción** - Obtiene datos del ERP/sistema fuente
2. **Transformación** - Limpia y normaliza los datos
3. **Carga** - Almacena en la base de datos de Fluxion

## Panel de Control

### Estado de Conexiones

Muestra el estado de conectividad:

| Indicador | Significado |
|-----------|-------------|
| 🟢 Verde | Conexión activa |
| 🟡 Amarillo | Conectado con advertencias |
| 🔴 Rojo | Sin conexión |

### Procesos ETL

Lista de procesos disponibles:

#### ETL de Ventas
Sincroniza transacciones de venta:
- Frecuencia: Cada hora (configurable)
- Datos: Fecha, tienda, producto, cantidad, monto

#### ETL de Inventario
Sincroniza niveles de stock:
- Frecuencia: Cada 4 horas (configurable)
- Datos: Stock actual por producto y tienda

### Última Ejecución

Para cada proceso muestra:
- Fecha y hora de última ejecución
- Estado (Exitoso/Con errores)
- Registros procesados
- Duración

## Acciones

### Ejecutar Manualmente

Para sincronizar datos inmediatamente:
1. Selecciona el proceso ETL
2. Click en **Ejecutar Ahora**
3. Espera a que termine
4. Revisa el resultado

### Ver Logs

Accede a los logs detallados:
- Historial de ejecuciones
- Errores y advertencias
- Tiempos de ejecución

### Verificar Conectividad

Prueba la conexión al sistema fuente:
1. Click en **Verificar Conectividad**
2. El sistema prueba la conexión
3. Muestra resultado y latencia

## Cobertura de Datos

### Calendario de Ventas

Visualiza qué días tienen datos sincronizados:
- **Verde**: Datos completos
- **Amarillo**: Datos parciales
- **Rojo**: Sin datos

### Recuperación de Gaps

Si detectas días sin datos:
1. Selecciona el rango faltante
2. Click en **Recuperar Datos**
3. El sistema intenta extraer los datos faltantes

## Monitoreo

### Alertas Automáticas

El sistema alerta cuando:
- Una sincronización falla
- Hay datos faltantes significativos
- La conexión se pierde

### Métricas

- Tiempo promedio de ejecución
- Tasa de éxito
- Registros procesados por hora

## Troubleshooting

### ETL falla consistentemente
1. Verifica conectividad al sistema fuente
2. Revisa credenciales
3. Consulta logs para detalles del error

### Datos no aparecen actualizados
1. Verifica última ejecución exitosa
2. Ejecuta manualmente
3. Revisa si hay errores en logs

## Próximos Pasos

- [Parámetros ABC](/modulos/administrador/parametros-abc)
- [Módulo de Ventas](/modulos/ventas) - Verificar datos sincronizados
