# Modal XYZ Detallado

## Resumen

Modal dedicado para visualización completa del análisis de variabilidad de demanda (XYZ) con interpretaciones contextuales y recomendaciones estratégicas.

## Acceso

**Desde la tabla de productos**:
- Click en celda **XYZ 📊** (columna azul)
- Hover muestra preview: "Demanda estable... CV: 0.25 - Click para ver análisis detallado"

## Estructura del Modal

### Header Dinámico

Color según clasificación:
- **Verde** (X): Demanda estable → `bg-gradient-to-r from-green-600 to-green-700`
- **Amarillo** (Y): Demanda variable → `bg-gradient-to-r from-yellow-600 to-yellow-700`
- **Rojo** (Z): Demanda errática → `bg-gradient-to-r from-red-600 to-red-700`

```
┌────────────────────────────────────────────────────────────┐
│ [VERDE/AMARILLO/ROJO según XYZ]                      [ X ] │
│ XYZ - Análisis de Variabilidad 📊                          │
│ 003289 - HUEVOS GRANDES AAA                                │
└────────────────────────────────────────────────────────────┘
```

### Sección 1: Clasificación Principal (Grid 2 columnas)

#### Columna Izquierda: Clasificación XYZ

**Muestra**:
- Letra gigante (X, Y o Z)
- Icono ⚡ si es extremadamente volátil
- Descripción textual
- Lista de características

**Para X (Estable)**:
```
┌─────────────────────────────────────┐
│ Clasificación XYZ                   │
│                                     │
│     X                               │
│                                     │
│ Demanda estable y predecible       │
│ (CV < 0.5)                          │
│                                     │
│ ¿Qué significa?                     │
│ • Demanda muy predecible            │
│ • Fácil de planificar               │
│ • Bajo riesgo de exceso o quiebre   │
└─────────────────────────────────────┘
```

**Para Y (Variable)**:
```
│     Y                               │
│                                     │
│ Demanda variable con tendencia      │
│ (0.5 ≤ CV < 1.0)                    │
│                                     │
│ • Demanda con tendencias            │
│ • Requiere seguimiento regular      │
│ • Riesgo moderado                   │
```

**Para Z (Errático)**:
```
│     Z    ⚡                         │
│                                     │
│ Demanda errática e impredecible    │
│ (CV ≥ 1.0)                          │
│                                     │
│ • Demanda muy impredecible          │
│ • Difícil de planificar             │
│ • Alto riesgo de error              │
│                                     │
│ ⚠️ Extremadamente volátil (CV>2.0)  │
```

#### Columna Derecha: Matriz ABC-XYZ

**Muestra**:
- Matriz combinada grande (ej: AX, BZ)
- Estrategia recomendada
- Interpretación breve

**Ejemplo AX (Ideal)**:
```
┌─────────────────────────────────────┐
│ Matriz Combinada                    │
│                                     │
│      AX                             │
│                                     │
│ Estrategia Recomendada              │
│ Stock alto, reposición automática   │
│                                     │
│ Interpretación                      │
│ A (valor) + X (variabilidad)        │
└─────────────────────────────────────┘
```

### Sección 2: Métricas Detalladas (Grid 4 columnas)

```
┌─────────────────────────────────────────────────────────────┐
│ 📈 Métricas de Variabilidad                                 │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ Coef. Var   │ Dem Promedio│ Desv. Est   │ Confiabilidad    │
│   0.25      │   6,537.6   │  1,617.8    │    ALTA          │
│   σ / μ     │ unidades/sem│  unidades   │  10/12 semanas   │
└─────────────┴─────────────┴─────────────┴──────────────────┘
```

**Cards individuales**:
- 3 métricas con fondo blanco
- 1 métrica de confiabilidad con color según nivel:
  - **ALTA** (verde): ≥8 semanas
  - **MEDIA** (amarillo): 4-7 semanas
  - **BAJA** (naranja): <4 semanas

### Sección 3: Interpretación Contextual

Aparece solo si aplica:

#### 🔥 Producto Crítico (AZ)

```
┌─────────────────────────────────────────────────────────────┐
│ 🔥 PRODUCTO CRÍTICO - Requiere Atención Especial            │
├─────────────────────────────────────────────────────────────┤
│ Este producto genera alto valor económico pero tiene        │
│ demanda muy impredecible. Es fundamental implementar        │
│ controles especiales.                                       │
│                                                             │
│ 🚨 Acciones Recomendadas:                                   │
│ • Monitoreo diario: Revisar stock y demanda todos los días │
│ • Stock de seguridad alto: Aumentar buffer variabilidad    │
│ • Alertas automáticas: Configurar notificaciones reorden   │
│ • Análisis de causas: Investigar por qué es tan errático   │
│ • Comunicación proveedores: Asegurar disponibilidad rápida │
└─────────────────────────────────────────────────────────────┘
```

**Estilo**: Fondo rojo claro, borde rojo, texto rojo oscuro

#### ✓ Producto Ideal (AX)

```
┌─────────────────────────────────────────────────────────────┐
│ ✓ PRODUCTO IDEAL - Fácil de Gestionar                      │
├─────────────────────────────────────────────────────────────┤
│ Este producto genera alto valor y tiene demanda            │
│ predecible. Es el tipo de producto más fácil de gestionar. │
│                                                             │
│ ✅ Estrategia Óptima:                                       │
│ • Stock alto: Mantener disponibilidad constante            │
│ • Reposición automática: Configurar puntos de reorden fijos│
│ • Prioridad máxima: Nunca debe faltar en tienda            │
│ • Revisión semanal: Monitoreo de rutina es suficiente      │
│ • Bajo riesgo: Demanda estable = inventario predecible     │
└─────────────────────────────────────────────────────────────┘
```

**Estilo**: Fondo verde claro, borde verde, texto verde oscuro

#### ⚠️ Candidato a Descontinuación (CZ)

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ CANDIDATO A DESCONTINUACIÓN                              │
├─────────────────────────────────────────────────────────────┤
│ Bajo valor económico + demanda errática = difícil de       │
│ justificar inventario.                                      │
│                                                             │
│ 🤔 Evaluar:                                                 │
│ • ¿Es realmente necesario mantener este producto?          │
│ • ¿Hay alternativa con mejor rotación?                     │
│ • ¿Se puede manejar solo bajo pedido?                      │
│ • Recomendación: Stock mínimo o descontinuar               │
└─────────────────────────────────────────────────────────────┘
```

**Estilo**: Fondo naranja claro, borde naranja, texto naranja oscuro

### Sección 4: Escala Visual de CV

Visualización gráfica mostrando dónde cae el producto en la escala:

```
┌─────────────────────────────────────────────────────────────┐
│ 📏 Escala de Coeficiente de Variación                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ CV < 0.5    [████████████████] X - Muy Predecible          │
│                                                             │
│ 0.5≤CV<1.0  [████████████████] Y - Variable                │
│                                                             │
│ CV ≥ 1.0    [████████████████] Z - Muy Errático       👈   │
│                                                             │
│ Tu producto: CV = 1.52 → Clasificación Z                   │
└─────────────────────────────────────────────────────────────┘
```

**Características**:
- Barras con gradiente de color según nivel
- Flecha 👈 indicando posición del producto
- Resumen textual al final

### Sección 5: Confiabilidad del Análisis

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 Confiabilidad del Análisis                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │  ALTA    │  │  MEDIA   │  │  BAJA    │                 │
│  │ ≥8 sem   │  │ 4-7 sem  │  │ <4 sem   │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
│       ✓                                                     │
│                                                             │
│ Este producto tuvo ventas en 10 de las últimas 12 semanas  │
│ → Confiabilidad ALTA                                       │
└─────────────────────────────────────────────────────────────┘
```

**Card activo**: Fondo coloreado y borde grueso según nivel

## Manejo de Productos sin XYZ

Si el producto no tiene clasificación XYZ:

```
┌─────────────────────────────────────────────────────────────┐
│ XYZ - Variabilidad de Demanda                         [ X ] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                     📊                                      │
│                                                             │
│          Sin clasificación XYZ disponible                   │
│                                                             │
│             003456 - PRODUCTO SIN DATOS                     │
│                                                             │
│   Este producto no tiene suficientes datos de ventas       │
│   semanales para calcular su variabilidad de demanda.      │
│                                                             │
│                    [ Cerrar ]                               │
└─────────────────────────────────────────────────────────────┘
```

## Datos Técnicos Mostrados

### Métricas Principales

| Campo | Descripción | Formato |
|-------|-------------|---------|
| **CV** | Coeficiente de Variación | 0.00 - 9.99 (2 decimales) |
| **Demanda Promedio** | Unidades por semana | 0.0 - 999,999.9 (1 decimal) |
| **Desviación Estándar** | Dispersión semanal | 0.0 - 999,999.9 (1 decimal) |
| **Semanas con Venta** | Del total analizado | 0 - 12 |
| **Confiabilidad** | ALTA/MEDIA/BAJA | Texto |

### Clasificaciones

| Campo | Valores Posibles | Color |
|-------|------------------|-------|
| **XYZ** | X, Y, Z | Verde, Amarillo, Rojo |
| **Matriz** | AX, AY, AZ, BX, BY, BZ, CX, CY, CZ | Según combinación |

### Flags Especiales

| Flag | Condición | Indicador |
|------|-----------|-----------|
| **Extremadamente Volátil** | CV > 2.0 | ⚡ |

## Props del Componente

```typescript
interface XYZModalProps {
  isOpen: boolean;                    // Control de visibilidad
  onClose: () => void;                // Handler de cierre
  clasificacion: ClasificacionABCv2 | null;  // Datos ABC v2 + XYZ
  producto: {
    codigo_producto: string;          // Código del producto
    descripcion_producto: string;     // Nombre descriptivo
  };
}
```

## Estados del Modal

### Estado 1: Sin Clasificación
- Muestra mensaje informativo
- No hay métricas disponibles
- Solo botón "Cerrar"

### Estado 2: Con Clasificación X (Estable)
- Header verde
- Card verde para clasificación
- No muestra interpretación especial (a menos que sea AX)
- Flecha apunta a zona X en escala

### Estado 3: Con Clasificación Y (Variable)
- Header amarillo
- Card amarillo para clasificación
- No muestra interpretación especial
- Flecha apunta a zona Y en escala

### Estado 4: Con Clasificación Z (Errático)
- Header rojo
- Card rojo para clasificación
- Puede mostrar interpretación AZ o CZ
- Flecha apunta a zona Z en escala
- Puede incluir icono ⚡ si CV > 2.0

## Interacciones

### Click en Fondo
- Cierra el modal (equivalente a botón X)

### Botón Cerrar
- Cierra el modal
- Estilo: Borde gris, fondo blanco, hover gris claro

### Scroll
- Modal con scroll interno
- Header y footer fijos (sticky)
- Contenido scrolleable hasta 90vh

## Responsive Design

**Desktop** (>768px):
- Grid 2 columnas para clasificaciones
- Grid 4 columnas para métricas
- Modal width: max-w-4xl

**Tablet** (>640px):
- Grid 2 columnas para clasificaciones
- Grid 4 columnas para métricas
- Modal width: max-w-4xl

**Mobile** (<640px):
- Grid 1 columna para clasificaciones
- Grid 2 columnas para métricas (responsive con md:)
- Modal width: 100% con padding

## Ejemplos de Uso

### Caso 1: Producto Estable (X)

**Input**:
```typescript
{
  clasificacion_xyz: 'X',
  matriz_abc_xyz: 'BX',
  coeficiente_variacion: 0.32,
  demanda_promedio_semanal: 1250.5,
  desviacion_estandar_semanal: 400.2,
  semanas_con_venta: 11,
  confiabilidad_calculo: 'ALTA',
  es_extremadamente_volatil: false
}
```

**Resultado**:
- Header verde
- Clasificación X con lista de beneficios
- Matriz BX con estrategia "Stock medio, reposición programada"
- Métricas completas
- Escala con flecha en zona verde
- Confiabilidad ALTA destacada

### Caso 2: Producto Crítico (AZ)

**Input**:
```typescript
{
  clasificacion_xyz: 'Z',
  matriz_abc_xyz: 'AZ',
  coeficiente_variacion: 1.52,
  demanda_promedio_semanal: 2628.3,
  desviacion_estandar_semanal: 3989.5,
  semanas_con_venta: 8,
  confiabilidad_calculo: 'ALTA',
  es_extremadamente_volatil: false
}
```

**Resultado**:
- Header rojo
- Clasificación Z con advertencias
- Matriz AZ con alerta crítica
- **Banner rojo** con acciones recomendadas (5 puntos)
- Métricas completas
- Escala con flecha en zona roja
- Confiabilidad ALTA (justo en el límite)

### Caso 3: Producto con Baja Confiabilidad

**Input**:
```typescript
{
  clasificacion_xyz: 'Y',
  matriz_abc_xyz: 'CY',
  coeficiente_variacion: 0.75,
  demanda_promedio_semanal: 45.2,
  desviacion_estandar_semanal: 33.9,
  semanas_con_venta: 3,
  confiabilidad_calculo: 'BAJA',
  es_extremadamente_volatil: false
}
```

**Resultado**:
- Header amarillo
- Clasificación Y
- Matriz CY (candidato a descontinuación)
- Métricas completas pero advertencia en confiabilidad
- **Warning**: "⚠️ Datos insuficientes para clasificación confiable"
- Card BAJA destacado en naranja

## Integración con Tabla

**Trigger**: Click en celda XYZ
```typescript
<td onClick={() => handleXYZClick(producto)}>
  AX
</td>
```

**Handler**:
```typescript
const handleXYZClick = (producto: ProductoPedido) => {
  setSelectedProductoXYZ(producto);
  setXyzModalOpen(true);
};
```

**Modal**:
```typescript
<XYZModal
  isOpen={xyzModalOpen}
  onClose={() => setXyzModalOpen(false)}
  clasificacion={clasificacionesV2.get(producto.codigo_producto) || null}
  producto={{
    codigo_producto: producto.codigo_producto,
    descripcion_producto: producto.descripcion_producto,
  }}
/>
```

## Archivos Relacionados

- **Componente**: [frontend/src/components/orders/XYZModal.tsx](frontend/src/components/orders/XYZModal.tsx)
- **Integración**: [frontend/src/components/orders/OrderStepTwo.tsx](frontend/src/components/orders/OrderStepTwo.tsx)
- **Servicio**: [frontend/src/services/abcV2Service.ts](frontend/src/services/abcV2Service.ts)
- **Backend**: [backend/routers/abc_v2_router.py](backend/routers/abc_v2_router.py)

---

**Fecha**: 2025-11-10
**Estado**: ✅ Implementado y funcionando
**Versión**: 1.0
