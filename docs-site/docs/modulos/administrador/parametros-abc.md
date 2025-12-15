---
sidebar_position: 3
title: Parametros ABC
---

# Configuracion de Parametros del Modelo ABC

Esta pagina te permite configurar todos los parametros que controlan la clasificacion ABC y los calculos de inventario (Stock de Seguridad, Punto de Reorden y Stock Maximo).

## Acceso

**Administrador > Parametros ABC**

Solo usuarios con rol de Administrador o Gerente tienen acceso.

La configuracion esta organizada en 3 pestanas:
1. **Parametros Globales** - Lead Time y Ventana σD
2. **Clasificacion ABC** - Umbrales de ranking, Z-scores y dias de cobertura por clase
3. **Por Tienda** - Configuraciones especificas por tienda

---

## 1. Parametros Globales

### Lead Time (L)

**Que es?** El tiempo en dias desde que haces un pedido hasta que llega la mercancia.

| Tipo de Pedido | Lead Time Default |
|----------------|-------------------|
| CEDI → Tienda | 1.5 dias |
| Inter-CEDI (Valencia → Caracas) | 2.0 dias |

**Como afecta los calculos?**

```
Stock de Seguridad (SS) = Z × σD × √L
Punto de Reorden (ROP) = (P75 × L) + SS
```

### Ejemplo: Efecto de cambiar Lead Time

**Producto:** Harina PAN 1kg (Clase A)
- P75 = 630 unid/dia
- σD = 166 unid
- Z = 2.33 (Clase A, 99%)

| Lead Time | SS Calculado | ROP Calculado | Impacto |
|-----------|--------------|---------------|---------|
| **L = 1.5** (default) | 474 | 1,419 | Base |
| **L = 2.0** | 548 | 1,808 | +27% ROP |
| **L = 3.0** | 670 | 2,560 | +80% ROP |

---

### Ventana σD (dias)

**Que es?** El numero de dias historicos que el sistema usa para calcular la desviacion estandar (σD) de la demanda.

| Parametro | Default | Unidad |
|-----------|---------|--------|
| **Ventana σD** | 30 | dias |

---

## 2. Clasificacion ABC

### Umbrales de Ranking

La clasificacion ABC se basa en **ranking por cantidad vendida** (unidades), no por valor monetario.

| Parametro | Valor Default | Descripcion |
|-----------|---------------|-------------|
| **umbral_a** | 50 | Top N productos para Clase A |
| **umbral_b** | 200 | Top N productos para Clase B |
| **umbral_c** | 800 | Top N productos para Clase C |

Productos con ranking mayor a `umbral_c` se clasifican como **Clase D**.

### Resultado de Clasificacion

| Ranking | Clase | Descripcion |
|---------|-------|-------------|
| 1-50 | **A** | Productos estrella, maxima rotacion |
| 51-200 | **B** | Productos importantes |
| 201-800 | **C** | Productos regulares |
| 801+ | **D** | Productos de baja rotacion |

### Cuando Ajustar Umbrales

| Escenario | Ajuste Sugerido |
|-----------|-----------------|
| Catalogo pequeno (<500 SKUs) | Reducir (30, 100, 300) |
| Catalogo grande (>2000 SKUs) | Aumentar (100, 400, 1500) |
| Foco en top performers | Reducir umbral_a (25-30) |

---

### Niveles de Servicio y Z-Scores

Cada clase tiene su propio nivel de servicio, que determina el stock de seguridad:

| Clase | Z-Score | Nivel Servicio | Metodo |
|-------|---------|----------------|--------|
| **A** | 2.33 | 99% | Estadistico |
| **B** | 1.88 | 97% | Estadistico |
| **C** | 1.28 | 90% | Estadistico |
| **D** | N/A | ~85% | Padre Prudente |

**Formula de Stock de Seguridad:**

Para clases A, B, C:
```
SS = Z × σD × √L
```

Para clase D (Padre Prudente):
```
SS = 0.30 × Demanda_Diaria × Lead_Time
```

### Ejemplo: Efecto de Z-Score

**Producto:** Harina PAN 1kg (σD = 166, L = 1.5)

| Clase | Z-Score | SS Calculado |
|-------|---------|--------------|
| **A** | 2.33 | 472 unidades |
| **B** | 1.88 | 381 unidades |
| **C** | 1.28 | 259 unidades |

---

### Dias de Cobertura

Los dias de cobertura determinan cuanto stock mantener despues del punto de reorden:

| Clase | Dias Cobertura | Razon |
|-------|----------------|-------|
| **A** | 7 dias | Alta rotacion, pedidos frecuentes |
| **B** | 14 dias | Rotacion media |
| **C** | 21 dias | Baja rotacion |
| **D** | 30 dias | Muy baja rotacion |

**Formula de Stock Maximo:**

```
Stock_Max = ROP + (P75 × Dias_Cobertura)
```

### Ejemplo: Efecto de Dias de Cobertura

**Producto:** Harina PAN 1kg (P75 = 630, ROP = 1,454)

| Clase | Dias | MAX Calculado |
|-------|------|---------------|
| **A** | 7 | 5,864 unidades |
| **B** | 14 | 10,274 unidades |
| **C** | 21 | 14,684 unidades |

---

### Metodo Padre Prudente (Clase D)

Para productos Clase D, en lugar del metodo estadistico:

```
SS = 0.30 × Demanda_Diaria × Lead_Time
```

**Por que?**
- Productos de baja rotacion tienen alta variabilidad
- El metodo estadistico puede dar resultados inestables
- El 30% garantiza un colchon minimo conservador

---

## 3. Configuracion Por Tienda

Permite sobrescribir valores globales para tiendas especificas.

### Como Agregar Configuracion

1. Selecciona la tienda en el dropdown
2. Completa solo los campos que quieras sobrescribir
3. Deja en blanco los campos que deben usar el valor global

### Casos de Uso

| Tienda | Ajuste | Razon |
|--------|--------|-------|
| Tienda remota | Lead Time mayor | Entregas mas lentas |
| Tienda alto volumen | Dias cobertura menor | Pedidos mas frecuentes |
| Tienda pequena | Dias cobertura mayor | Menos espacio para pedidos frecuentes |

---

## Tabla de Configuracion en BD

Los parametros se almacenan en `config_inventario_global`:

```sql
-- Umbrales de ranking ABC
('abc_umbral_a', 'abc_umbrales_ranking', 'umbral_a', 50)
('abc_umbral_b', 'abc_umbrales_ranking', 'umbral_b', 200)
('abc_umbral_c', 'abc_umbrales_ranking', 'umbral_c', 800)

-- Z-Scores por clase
('z_score_a', 'niveles_servicio', 'clase_a', 2.33)
('z_score_b', 'niveles_servicio', 'clase_b', 1.88)
('z_score_c', 'niveles_servicio', 'clase_c', 1.28)

-- Dias de cobertura por clase
('dias_cobertura_a', 'dias_cobertura', 'clase_a', 7)
('dias_cobertura_b', 'dias_cobertura', 'clase_b', 14)
('dias_cobertura_c', 'dias_cobertura', 'clase_c', 21)
('dias_cobertura_d', 'dias_cobertura', 'clase_d', 30)
```

---

## Recalculo de Clasificacion

### Automatico
- Se ejecuta semanalmente
- Considera ventas de los ultimos 90 dias

### Manual
1. Click en **Recalcular ABC**
2. Confirmar accion
3. Esperar procesamiento

### Proceso

1. Extraer ventas ultimos 90 dias por tienda/region
2. Sumar cantidad vendida por producto
3. Ordenar de mayor a menor (ranking)
4. Asignar clase segun umbrales
5. Actualizar tablas `productos_abc_cache` y `productos_abc_tienda`

---

## Impacto de Cambios

| Parametro | Modulos Afectados |
|-----------|-------------------|
| Umbrales ranking | Clasificacion ABC, Pedidos, Alertas |
| Z-Scores | Stock de Seguridad, ROP |
| Dias cobertura | Stock Maximo, Cantidad Sugerida |
| Lead times | ROP, Stock de Seguridad |

### Recomendacion

Despues de cambiar parametros:
1. Ejecutar recalculo ABC
2. Revisar productos representativos
3. Validar que los valores tienen sentido
4. Monitorear pedidos sugeridos los primeros dias

---

## Resumen de Parametros

### Tabla Completa

| Clase | Ranking | Z-Score | Nivel Serv. | Dias Cob. | Metodo |
|-------|---------|---------|-------------|-----------|--------|
| **A** | Top 50 | 2.33 | 99% | 7 | Estadistico |
| **B** | 51-200 | 1.88 | 97% | 14 | Estadistico |
| **C** | 201-800 | 1.28 | 90% | 21 | Estadistico |
| **D** | 801+ | N/A | ~85% | 30 | Padre Prudente |

---

## Proximos Pasos

- [Clasificacion ABC](/modulos/productos/clasificacion-abc) - Ver productos clasificados
- [Pedidos Sugeridos](/modulos/pedidos-sugeridos) - Ver impacto en pedidos
- [Conceptos ABC](/conceptos/clasificacion-abc) - Teoria de clasificacion
