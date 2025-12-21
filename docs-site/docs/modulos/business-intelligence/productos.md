---
sidebar_position: 4
title: Matriz de Productos
---

# Matriz de Productos

La pestaña de Productos clasifica el catalogo usando la matriz GMROI × Rotacion, permitiendo identificar productos estrella y candidatos a eliminar.

## Concepto de la Matriz

La matriz BCG adaptada a retail clasifica productos en cuatro cuadrantes:

```
                    Alta Rotacion          Baja Rotacion
              ┌─────────────────────┬─────────────────────┐
  Alto GMROI  │      ESTRELLA       │       NICHO         │
              │   Priorizar stock   │   Evaluar demanda   │
              ├─────────────────────┼─────────────────────┤
  Bajo GMROI  │        VACA         │       PERRO         │
              │  Mantener volumen   │  Candidato eliminar │
              └─────────────────────┴─────────────────────┘
```

## Cuadrantes

### ESTRELLA (Alto GMROI + Alta Rotacion)

- **Caracteristica**: Productos muy rentables que rotan rapido
- **Accion**: Priorizar disponibilidad, evitar stockouts a toda costa
- **Ejemplo**: Productos premium de alta demanda

### VACA (Bajo GMROI + Alta Rotacion)

- **Caracteristica**: Mueven volumen pero con margen bajo
- **Accion**: Mantener, generan flujo de caja
- **Ejemplo**: Productos basicos de consumo masivo

### NICHO (Alto GMROI + Baja Rotacion)

- **Caracteristica**: Buenos margenes pero poca demanda
- **Accion**: Evaluar si el inventario se justifica
- **Ejemplo**: Productos especializados o de temporada

### PERRO (Bajo GMROI + Baja Rotacion)

- **Caracteristica**: No generan margen ni rotan
- **Accion**: Candidatos fuertes a eliminar del catalogo
- **Ejemplo**: Productos obsoletos o con baja demanda local

## Cards de Resumen

Al entrar a la pestaña, se muestran 4 cards con el conteo de productos por cuadrante:

```
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│  ESTRELLA  │  │    VACA    │  │   NICHO    │  │   PERRO    │
│    245     │  │    312     │  │    178     │  │    89      │
└────────────┘  └────────────┘  └────────────┘  └────────────┘
```

Al hacer clic en un card, se filtra la tabla para mostrar solo ese cuadrante.

## Umbrales por Categoria

Los umbrales varian segun la categoria del producto:

### Seco (cedi_seco)

| Metrica | Alto | Bajo |
|---------|------|------|
| GMROI | Mayor a 2.5 | Menor a 1.5 |
| Rotacion | Mayor a 8x | Menor a 4x |
| Umbral Medio | GMROI: 2.0, Rotacion: 6x |

### Frio (cedi_frio)

| Metrica | Alto | Bajo |
|---------|------|------|
| GMROI | Mayor a 2.0 | Menor a 1.2 |
| Rotacion | Mayor a 15x | Menor a 8x |
| Umbral Medio | GMROI: 1.6, Rotacion: 11.5x |

### Verde (cedi_verde)

| Metrica | Alto | Bajo |
|---------|------|------|
| GMROI | Mayor a 1.8 | Menor a 1.0 |
| Rotacion | Mayor a 25x | Menor a 12x |
| Umbral Medio | GMROI: 1.4, Rotacion: 18.5x |

Los productos perecederos tienen umbrales mas altos de rotacion y mas bajos de GMROI, reflejando su naturaleza de alta velocidad.

## Listas Especiales

### Productos Estrella (Top 20)

La seccion izquierda muestra los 20 mejores productos ordenados por GMROI:

| Columna | Descripcion |
|---------|-------------|
| Producto | Nombre y categoria |
| GMROI | Retorno sobre inventario |
| Rotacion | Veces que rota al año |
| Ventas 30d | Ventas del periodo |

Estos productos son los heroes del inventario y deben priorizarse.

### Candidatos a Eliminar (Top 20)

La seccion derecha muestra los 20 peores productos:

| Columna | Descripcion |
|---------|-------------|
| Producto | Nombre y categoria |
| GMROI | Retorno (tipicamente menor a 1) |
| Rotacion | Veces que rota (tipicamente menor a 2x) |
| Stock $ | Valor de inventario atrapado |

Estos productos atan capital sin generar retorno.

## Tabla Completa

La tabla inferior muestra todos los productos con filtros disponibles:

| Columna | Descripcion |
|---------|-------------|
| Producto | Nombre e ID |
| Categoria | Seco/Frio/Verde |
| GMROI | Con color segun valor |
| Rotacion | Veces por año |
| Ventas 30d | En USD |
| Margen % | Margen promedio |
| Cuadrante | Badge de clasificacion |

### Filtros

- **Cuadrante**: Click en los cards superiores
- **Categoria**: Selector desplegable

## Calculo de Cuadrante

```python
# Obtener umbrales segun categoria
umbral_gmroi = (gmroi_alto + gmroi_bajo) / 2
umbral_rotacion = (rotacion_alta + rotacion_baja) / 2

# Clasificar
if gmroi >= umbral_gmroi and rotacion >= umbral_rotacion:
    cuadrante = "ESTRELLA"
elif gmroi >= umbral_gmroi and rotacion < umbral_rotacion:
    cuadrante = "NICHO"
elif gmroi < umbral_gmroi and rotacion >= umbral_rotacion:
    cuadrante = "VACA"
else:
    cuadrante = "PERRO"
```

## Casos de Uso

### Caso 1: Optimizacion de Catalogo

1. Filtrar por cuadrante PERRO
2. Ordenar por Stock $ descendente
3. Identificar los que atan mas capital
4. Generar lista de discontinuacion

### Caso 2: Analisis por Categoria

1. Filtrar por categoria Verde
2. Revisar distribucion de cuadrantes
3. Si hay muchos PERRO, revisar surtido

### Caso 3: Proteger Estrellas

1. Ver lista de Productos Estrella
2. Verificar niveles de stock de cada uno
3. Asegurar que no entren en quiebre

## Proxima Seccion

- [Rentabilidad](/modulos/business-intelligence/rentabilidad) - Analisis por categoria y productos
