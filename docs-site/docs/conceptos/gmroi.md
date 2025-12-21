---
sidebar_position: 5
title: GMROI
---

# GMROI (Gross Margin Return on Investment)

El GMROI es una metrica fundamental para evaluar la rentabilidad del inventario, midiendo cuantos dolares de margen bruto se generan por cada dolar invertido en inventario.

## Formula

```
GMROI = Utilidad Bruta / Inventario Promedio
```

Donde:
- **Utilidad Bruta** = Ventas - Costo de Ventas
- **Inventario Promedio** = (Inventario Inicio + Inventario Fin) / 2

## Ejemplo Practico

Un producto tiene:
- Ventas mensuales: $10,000
- Costo de ventas: $7,000
- Inventario promedio: $1,500

```
Utilidad Bruta = $10,000 - $7,000 = $3,000
GMROI = $3,000 / $1,500 = 2.0
```

Interpretacion: Por cada $1 invertido en inventario, se genera $2 de utilidad bruta.

## Interpretacion

| GMROI | Interpretacion | Accion |
|-------|----------------|--------|
| Mayor a 3.0 | Excelente | Mantener/aumentar stock |
| 2.0 - 3.0 | Bueno | Mantener |
| 1.5 - 2.0 | Aceptable | Monitorear |
| 1.0 - 1.5 | Bajo | Revisar precios o costos |
| Menor a 1.0 | Problematico | Considerar eliminar |

## GMROI vs Margen Bruto

| Metrica | Mide | Limitacion |
|---------|------|------------|
| **Margen Bruto %** | Eficiencia de cada venta | No considera inversion |
| **GMROI** | Retorno sobre capital invertido | Requiere datos de inventario |

### Ejemplo Comparativo

| Producto | Margen % | Inventario | GMROI | Mejor? |
|----------|----------|------------|-------|--------|
| A | 40% | $5,000 | 1.2 | Margen alto, retorno bajo |
| B | 20% | $500 | 3.0 | Margen bajo, retorno alto |

El producto B con menor margen es **mas eficiente** en uso de capital.

## Factores que Afectan el GMROI

### Mejoran el GMROI

1. **Aumentar margen**: Negociar mejores costos o subir precios
2. **Reducir inventario**: Optimizar niveles de stock
3. **Acelerar rotacion**: Vender mas rapido

### Reducen el GMROI

1. **Descuentos excesivos**: Erosionan margen
2. **Sobre-stock**: Capital atrapado
3. **Baja rotacion**: Producto estancado

## GMROI por Categoria

Los benchmarks varian segun el tipo de producto:

| Categoria | GMROI Tipico | GMROI Objetivo |
|-----------|--------------|----------------|
| Seco/Abarrotes | 2.0-2.5 | 2.5+ |
| Refrigerados | 1.5-2.0 | 2.0+ |
| Perecederos/Verde | 1.2-1.8 | 1.8+ |
| Congelados | 1.8-2.2 | 2.2+ |

Los perecederos tienen GMROI objetivo mas bajo porque:
- Rotan muy rapido (compensan con volumen)
- Tienen mayor riesgo de merma
- Margenes tipicamente mas bajos

## Relacion GMROI × Rotacion

```
GMROI = Margen Bruto % × Rotacion
```

Esta relacion muestra que hay dos caminos para mejorar GMROI:
1. Subir el margen
2. Aumentar la rotacion

### Matriz de Clasificacion

|              | Alta Rotacion | Baja Rotacion |
|--------------|---------------|---------------|
| **Alto GMROI** | ESTRELLA | NICHO |
| **Bajo GMROI** | VACA | PERRO |

## Calculo en Fluxion

Fluxion calcula el GMROI usando:

```python
def calcular_gmroi(utilidad_bruta: float, inventario_promedio: float) -> float:
    if inventario_promedio <= 0:
        return 0.0
    return round(utilidad_bruta / inventario_promedio, 2)
```

- Periodo: Ultimos 30 dias
- Inventario: Promedio de snapshots del periodo
- Utilidad: Suma de (precio_venta - costo) × cantidad

## Casos de Uso

### Caso 1: Evaluar Nuevo Producto

Antes de listar un producto:
- Proyectar ventas mensuales
- Estimar inventario necesario
- Calcular GMROI esperado
- Si menor a 1.5, reconsiderar

### Caso 2: Negociacion con Proveedor

Si un producto tiene:
- Alto volumen de ventas
- Bajo GMROI (menor a 1.5)

Usar como argumento para negociar:
- Mejor precio de compra
- Terminos de pago mas favorables
- Consignacion

### Caso 3: Limpieza de Catalogo

Identificar productos con:
- GMROI menor a 1.0
- Rotacion menor a 4x anual
- Stock valorizado mayor a $1,000

Estos son candidatos fuertes para discontinuar.

## Limitaciones

1. **No considera costos fijos**: Almacenamiento, personal, etc.
2. **Periodo dependiente**: Puede variar por temporada
3. **Requiere datos precisos**: Costos y inventario actualizados

## Benchmarks de Industria

Segun investigaciones de mercado (Shopify, Retalon, NACS):

| Industria | GMROI Promedio |
|-----------|----------------|
| Supermercados | 2.0 |
| Mayoristas | 1.5-1.8 |
| Tiendas de Conveniencia | 2.2-2.5 |
| Farmacias | 3.0+ |

## Ver Tambien

- [Clasificacion ABC](/conceptos/clasificacion-abc) - Segmentacion por importancia
- [Analisis XYZ](/conceptos/analisis-xyz) - Segmentacion por variabilidad
- [Rotacion de Inventario](/modulos/business-intelligence/productos) - Velocidad de venta
