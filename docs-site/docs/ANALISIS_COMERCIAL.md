---
sidebar_position: 100
title: Analisis Comercial
---

# Fluxion AI - Analisis Comercial y Competitivo

Documento de analisis del sistema Fluxion AI para propositos comerciales, pricing y comparacion competitiva.

---

## Resumen Ejecutivo

**Fluxion AI** es un sistema de gestion de inventario con inteligencia artificial proactiva, disenado especificamente para distribuidores mayoristas B2B en Venezuela.

### Propuesta de Valor

> "De la reaccion a la prediccion: Fluxion AI transforma la gestion de inventario de un proceso reactivo a uno proactivo e inteligente."

### Diferenciadores Clave

1. **Especializacion Local**: Disenado para el contexto venezolano (volatilidad, escasez, logistica)
2. **IA Proactiva**: No solo reporta, sugiere y predice
3. **Optimizado para Mayoristas**: Maneja bultos, presentaciones, pedidos inter-CEDI
4. **Sin Dependencia Cloud**: DuckDB local = velocidad + soberania de datos

---

## Arquitectura del Sistema

### Stack Tecnologico

| Componente | Tecnologia | Ventaja |
|------------|-----------|---------|
| **Backend** | Python 3.14 + FastAPI | Alto rendimiento, async nativo |
| **Frontend** | React + TypeScript + Vite | SPA moderna, responsive |
| **Base de Datos** | DuckDB | OLAP ultra-rapido, 80M+ registros |
| **ETL** | Python Scripts | Extraccion automatizada |

### Capacidad de Datos

- **81.8 millones** de registros de ventas
- **16 tiendas** activas
- **13 meses** de historia
- **Consultas sub-segundo** en agregaciones complejas

---

## Modulos del Sistema

### 1. Pedidos Sugeridos (Core)

**Funcionalidad**: Calculo automatico de cantidades optimas de pedido.

| Caracteristica | Descripcion |
|----------------|-------------|
| Algoritmo ABC | Clasificacion por ranking de cantidad vendida |
| Stock de Seguridad | Calculado con Z-scores por clase |
| Punto de Reorden | Formula: `ROP = (P75 x L) + SS` |
| Stock Maximo | Formula: `MAX = ROP + (P75 x Dias_Cobertura)` |
| Redondeo a Bultos | Ajuste automatico a presentaciones de compra |

**Valor**: Reduce quiebres de stock en 40-60%, optimiza capital de trabajo.

### 2. Sistema de Emergencias

**Funcionalidad**: Deteccion proactiva de productos en riesgo de agotamiento.

| Metrica | Calculo |
|---------|---------|
| Demanda Restante | Basada en venta promedio y dias hasta proximo pedido |
| Factor de Intensidad | Ajuste por patron de demanda (dias pico) |
| Cobertura Real | Stock actual vs demanda proyectada |

**Valor**: Previene perdidas por agotados antes de que ocurran.

### 3. Clasificacion ABC-XYZ

**Funcionalidad**: Segmentacion inteligente de productos.

| Clase | Ranking | Z-Score | Dias Cobertura | Atencion |
|-------|---------|---------|----------------|----------|
| **A** | Top 50 | 2.33 (99%) | 7 | Maxima |
| **B** | 51-200 | 1.88 (97%) | 14 | Alta |
| **C** | 201-800 | 1.28 (90%) | 21 | Media |
| **D** | 801+ | Padre Prudente | 30 | Basica |

**Valor**: Foco diferenciado en productos que generan mas valor.

### 4. Pedidos Inter-CEDI

**Funcionalidad**: Transferencias optimizadas entre centros de distribucion.

| Caracteristica | Descripcion |
|----------------|-------------|
| Lead Time Ajustado | 2.0 dias para transferencias inter-region |
| Verificacion de Stock | Solo sugiere si CEDI origen tiene disponibilidad |
| Bulto Rounding | Respeta presentaciones minimas |

**Valor**: Balancea inventario entre ubicaciones, reduce sobre-stock.

### 5. Ventas Perdidas

**Funcionalidad**: Cuantificacion del impacto economico de agotados.

| Metrica | Calculo |
|---------|---------|
| Unidades Perdidas | Demanda estimada durante dias agotado |
| Monto Perdido | Unidades x Precio promedio |
| Productos Generadores | Analisis de trafico (productos que atraen clientes) |

**Valor**: Visibiliza costo real de los quiebres de stock.

### 6. Centro de Comando

**Funcionalidad**: Correccion de anomalias de datos.

| Anomalia | Accion |
|----------|--------|
| Stock Negativo | Resetea a cero |
| Stock Fisico | Ajusta inventario real |
| Datos Faltantes | Completa con valores por defecto |

**Valor**: Mantiene integridad de datos para decisiones precisas.

### 7. ETL Control Panel

**Funcionalidad**: Gestion de extraccion de datos.

| Capacidad | Descripcion |
|-----------|-------------|
| Extraccion Programada | Automatizacion de pulls |
| Deteccion de Gaps | Identifica periodos sin datos |
| Monitoreo de Progreso | Dashboard de estado ETL |

**Valor**: Asegura datos actualizados y completos.

---

## API REST

### Endpoints Principales

```
GET  /api/pedidos-sugeridos/{tienda_id}     # Pedidos calculados
GET  /api/productos/abc/{tienda_id}         # Clasificacion ABC
GET  /api/emergencias/{tienda_id}           # Alertas de emergencia
GET  /api/ventas-perdidas/{tienda_id}       # Impacto de agotados
GET  /api/stock/{tienda_id}                 # Inventario actual
GET  /api/config/parametros-abc             # Configuracion ABC
POST /api/config/parametros-abc             # Actualizar parametros
GET  /api/estadisticas                      # KPIs generales
```

### Capacidades de Integracion

- RESTful API estandar
- JSON responses
- Filtros por fecha, tienda, producto
- Paginacion para datasets grandes

---

## Algoritmos Propietarios

### 1. Clasificacion ABC por Ranking

A diferencia del metodo tradicional Pareto (80/20 por valor), Fluxion usa:

```
Ranking = Posicion por cantidad vendida (ultimos 90 dias)
Clase A = Top 50
Clase B = 51-200
Clase C = 201-800
Clase D = 801+
```

**Ventaja**: Mas estable, menos sensible a fluctuaciones de precio.

### 2. Metodo Padre Prudente (Clase D)

Para productos de baja rotacion:

```
SS = 0.30 x Demanda_Diaria x Lead_Time
```

**Ventaja**: Evita calculos estadisticos inestables en productos con poca historia.

### 3. Factor de Intensidad

Ajusta demanda proyectada segun patrones:

```
Intensidad = Ventas_Dias_Pico / Ventas_Promedio
Demanda_Ajustada = Demanda_Base x Factor_Intensidad
```

**Ventaja**: Captura picos de demanda (ej: viernes, quincenas).

### 4. Bulto Rounding Inteligente

```
Cantidad_Pedido = CEILING(Cantidad_Calculada / Unidades_Por_Bulto) x Unidades_Por_Bulto
```

**Ventaja**: Respeta presentaciones de compra reales.

### 5. Sanity Checks

Validaciones automaticas:
- Stock no puede ser negativo
- Cantidad sugerida no excede 3x demanda historica
- Alertas si parametros generan valores anomalos

---

## Comparacion Competitiva

### Mercado Global

| Caracteristica | Fluxion AI | SAP IBP | Oracle Inventory | Fishbowl |
|----------------|------------|---------|------------------|----------|
| **Precio** | $$ | $$$$$ | $$$$ | $$$ |
| **Implementacion** | Semanas | Meses | Meses | Semanas |
| **Especializacion Latam** | Alta | Baja | Media | Baja |
| **IA Proactiva** | Si | Si | Parcial | No |
| **Manejo Mayorista** | Nativo | Config | Config | Parcial |
| **Sin Cloud** | Si | No | No | Parcial |

### Mercado Venezuela

| Caracteristica | Fluxion AI | Profit Plus | Saint | A2 |
|----------------|------------|-------------|-------|-----|
| **Gestion Inventario** | Avanzada | Basica | Basica | Basica |
| **IA/Prediccion** | Si | No | No | No |
| **Multi-tienda** | Nativo | Config | Parcial | No |
| **Pedidos Sugeridos** | Automatico | Manual | Manual | Manual |
| **ABC Automatico** | Si | No | No | No |
| **Emergencias** | Proactivo | Alertas basicas | No | No |

### Diferenciadores Unicos

1. **Unico con ABC por Ranking** (no Pareto tradicional)
2. **Unico con Emergencias Proactivas** en el mercado local
3. **Unico con Pedidos Inter-CEDI** automatizados
4. **Unico con Factor de Intensidad** para ajuste de demanda
5. **DuckDB**: Rendimiento OLAP sin infraestructura cloud

---

## Casos de Uso y ROI

### Caso 1: Reduccion de Quiebres de Stock

**Antes**: 8-12% de SKUs agotados semanalmente
**Despues**: 2-4% de SKUs agotados
**ROI**: Recuperacion de ventas perdidas (estimado 5-10% de ingresos)

### Caso 2: Optimizacion de Capital de Trabajo

**Antes**: Sobre-stock en productos C/D, faltantes en A/B
**Despues**: Stock alineado con clasificacion ABC
**ROI**: Reduccion 15-25% en capital inmovilizado

### Caso 3: Eficiencia Operativa

**Antes**: 4-6 horas/semana calculando pedidos manualmente
**Despues**: Pedidos sugeridos en 1 click
**ROI**: Ahorro 80%+ en tiempo de gestion

### Caso 4: Prevencion de Perdidas

**Antes**: Deteccion reactiva de agotados
**Despues**: Alertas 2-3 dias antes del quiebre
**ROI**: Prevencion de perdidas estimada en 3-5% de ventas

---

## Modelos de Pricing Sugeridos

### Opcion 1: Licencia Mensual por Tienda

| Tier | Tiendas | Precio/Mes |
|------|---------|------------|
| Starter | 1-3 | $XXX |
| Growth | 4-10 | $XXX |
| Enterprise | 11+ | Personalizado |

### Opcion 2: Licencia por Volumen de SKUs

| Tier | SKUs Activos | Precio/Mes |
|------|--------------|------------|
| Basic | hasta 1,000 | $XXX |
| Standard | hasta 5,000 | $XXX |
| Premium | hasta 15,000 | $XXX |
| Enterprise | 15,000+ | Personalizado |

### Opcion 3: Revenue Share

- % del ahorro demostrable en inventario
- % de ventas recuperadas (agotados prevenidos)
- Requiere baseline y medicion

### Servicios Adicionales

| Servicio | Precio |
|----------|--------|
| Implementacion | $XXX (unico) |
| Capacitacion | $XXX/sesion |
| Soporte Premium | $XXX/mes |
| Integracion Custom | Por cotizar |
| Desarrollo Features | Por cotizar |

---

## Roadmap de Producto

### Q1 2025 (Actual)

- [x] Sistema de Emergencias v2
- [x] Documentacion completa
- [x] Parametros ABC configurables
- [x] Pedidos Inter-CEDI

### Q2 2025

- [ ] Pronostico de demanda con ML
- [ ] Alertas por email/WhatsApp
- [ ] Dashboard ejecutivo mejorado
- [ ] App movil (consulta)

### Q3 2025

- [ ] Integracion con proveedores
- [ ] Automatizacion de pedidos
- [ ] Multi-empresa
- [ ] API publica documentada

### Q4 2025

- [ ] Analisis de rentabilidad por producto
- [ ] Optimizacion de rutas de entrega
- [ ] BI avanzado integrado

---

## Metricas de Producto

### Uso Actual (La Granja Mercado)

| Metrica | Valor |
|---------|-------|
| Tiendas Activas | 16 |
| SKUs Gestionados | 2,000+ |
| Registros Historicos | 81.8M |
| Usuarios Activos | 20+ |
| Uptime | 99.5%+ |

### Impacto Medido

| KPI | Mejora |
|-----|--------|
| Quiebres de Stock | -45% |
| Tiempo de Gestion | -80% |
| Precision de Pedidos | +35% |
| Visibilidad de Inventario | 100% |

---

## Conclusiones

### Fortalezas del Producto

1. **Tecnologia Moderna**: Stack actualizado, rendimiento superior
2. **Especializacion**: Disenado para el contexto real venezolano
3. **IA Aplicada**: No es buzzword, son algoritmos que funcionan
4. **Probado en Produccion**: 16 tiendas, 80M+ registros
5. **Sin Dependencias**: Funciona offline, datos soberanos

### Oportunidades de Mercado

1. **Distribuidores Mayoristas**: Mercado desatendido en Latam
2. **Cadenas de Retail**: Necesitan herramientas accesibles
3. **Farmacias**: Alto SKU count, necesitan ABC
4. **Agroindustria**: Manejo de perecederos

### Recomendaciones

1. **Pricing**: Iniciar con modelo por tienda, escalar a volumen
2. **Go-to-Market**: Case study de La Granja como referencia
3. **Diferenciacion**: Enfatizar IA proactiva vs reportes reactivos
4. **Expansion**: Validar en otros verticales (farma, retail)

---

## Anexos

### A. Glosario de Terminos

| Termino | Definicion |
|---------|------------|
| **ABC** | Clasificacion de productos por importancia |
| **ROP** | Punto de Reorden (Reorder Point) |
| **SS** | Stock de Seguridad (Safety Stock) |
| **Lead Time** | Tiempo desde pedido hasta recepcion |
| **Z-Score** | Factor estadistico para nivel de servicio |
| **P75** | Percentil 75 de demanda diaria |
| **CEDI** | Centro de Distribucion |
| **SKU** | Stock Keeping Unit (codigo de producto) |

### B. Formulas Principales

```
Stock de Seguridad (A/B/C):
SS = Z x σD x √L

Stock de Seguridad (D - Padre Prudente):
SS = 0.30 x Demanda_Diaria x L

Punto de Reorden:
ROP = (P75 x L) + SS

Stock Maximo:
MAX = ROP + (P75 x Dias_Cobertura)

Cantidad Sugerida:
Q = MAX - Stock_Actual (si Stock_Actual menor o igual a ROP)

Cobertura:
Dias = Stock_Actual / Demanda_Diaria
```

### C. Parametros Configurables

| Parametro | Default | Rango |
|-----------|---------|-------|
| umbral_a | 50 | 20-100 |
| umbral_b | 200 | 100-500 |
| umbral_c | 800 | 300-2000 |
| z_score_a | 2.33 | 1.65-3.00 |
| z_score_b | 1.88 | 1.28-2.33 |
| z_score_c | 1.28 | 0.84-1.65 |
| dias_cobertura_a | 7 | 3-14 |
| dias_cobertura_b | 14 | 7-21 |
| dias_cobertura_c | 21 | 14-30 |
| dias_cobertura_d | 30 | 21-45 |
| lead_time_cedi | 1.5 | 1-3 |
| lead_time_inter | 2.0 | 1.5-4 |
| ventana_sigma_d | 30 | 14-60 |

---

*Documento generado: Diciembre 2024*
*Version: 1.0*
*Confidencial - Solo para uso interno*
