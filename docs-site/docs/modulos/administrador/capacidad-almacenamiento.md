---
sidebar_position: 4
title: Limites de Inventario
---

# Configuracion de Limites de Inventario por Producto

Esta pagina te permite configurar limites de inventario por producto y tienda. Puedes establecer:

- **Capacidad Maxima:** Limite superior por espacio fisico (congelador, anaquel, etc.)
- **Minimo de Exhibicion:** Limite inferior para que el producto se vea bien en exhibicion

Cuando generas un pedido sugerido, el sistema respetara estos limites y ajustara automaticamente las cantidades sugeridas.

## Acceso

**Administrador > Parametros ABC > Capacidad Almacenamiento**

Solo usuarios con rol de Administrador o Gerente tienen acceso.

---

## Cuando Usar Esta Configuracion

### Capacidad Maxima

Usa este limite cuando:

- **Espacio limitado de congeladores:** El congelador de una tienda solo puede almacenar cierta cantidad de un producto
- **Refrigeradores con capacidad fija:** Los refrigeradores tienen espacio limitado para ciertos productos
- **Anaqueles/estantes limitados:** El espacio de exhibicion es fijo para algunos productos
- **Restricciones fisicas especificas:** Cualquier limitacion de espacio que afecte cuanto puedes almacenar

#### Ejemplo: Congelados

**Problema:** Fluxion sugirio pedir 350 unidades de helado, pero el congelador de la tienda solo puede almacenar 200 unidades en total.

**Solucion:** Configurar capacidad maxima = 200 unidades para ese producto en esa tienda.

**Resultado:** El sistema ahora sugerira maximo lo que cabe en el congelador, considerando el stock actual.

### Minimo de Exhibicion

Usa este limite cuando:

- **Productos pequenos que necesitan "frente":** Chocolates, chicles, dulces que necesitan cantidad minima para verse bien
- **Productos clase C o D con baja rotacion:** Aunque el calculo ABC sugiera poco, el mostrador necesita mas para lucir
- **Exhibidores que se ven vacios:** Productos que "desaparecen" visualmente si hay pocas unidades

#### Ejemplo: Chocolates

**Problema:** Los chocolates clase D solo venden 2 unidades/dia. Con 14 dias de cobertura, el sistema sugiere 28 unidades. Pero el mostrador se ve vacio con menos de 50 unidades.

**Solucion:** Configurar minimo de exhibicion = 50 unidades.

**Resultado:** Si el stock baja de 50, el sistema sugerira pedir hasta alcanzar las 50 unidades minimas de exhibicion, aunque el calculo ABC sugiera menos.

---

## Como Configurar

### Paso 1: Ir a la Pestana

1. Navegar a **Administrador > Parametros ABC**
2. Seleccionar la pestana **Capacidad Almacenamiento**

### Paso 2: Agregar Limite

1. **Seleccionar tienda:** Elige la tienda donde aplica el limite
2. **Buscar producto:** Escribe el codigo o nombre del producto
3. **Configurar limites:**
   - **Capacidad Maxima (opcional):** Cuantas unidades caben fisicamente
   - **Minimo Exhibicion (opcional):** Cuantas unidades minimas para que se vea bien
4. **Seleccionar tipo:** Congelador, Refrigerador, Anaquel, etc.
5. **Notas (opcional):** Ej: "2 freezers de 100 unidades cada uno"
6. Click en **Agregar**

**Nota:** Debes configurar al menos uno de los dos limites (capacidad maxima o minimo exhibicion).

### Paso 3: Verificar

La configuracion aparecera en la tabla de "Limites Configurados". Puedes eliminarla si ya no aplica.

---

## Tipos de Restriccion

| Tipo | Descripcion | Ejemplo |
|------|-------------|---------|
| **Congelador** | Capacidad de congeladores | Helados, carnes congeladas |
| **Refrigerador** | Capacidad de refrigeradores | Lacteos, embutidos |
| **Anaquel** | Espacio en estantes | Enlatados, productos secos |
| **Piso** | Espacio en piso/paletas | Productos a granel, bebidas |
| **Exhibidor** | Espacio en exhibidores | Snacks, confiteria |
| **Espacio Fisico** | Otro tipo de restriccion | Casos especiales |

---

## Como Afecta los Pedidos Sugeridos

### Sin Configuracion (Comportamiento Normal)

El sistema calcula la cantidad sugerida usando el modelo ABC estadistico:

```
Cantidad Sugerida = Stock Maximo - Stock Actual
```

### Con Minimo de Exhibicion

El sistema eleva la sugerencia si es necesario:

```
1. Calcular cantidad sugerida normal (ABC)
2. Calcular unidades necesarias = Minimo Exhibicion - Stock Actual
3. Si unidades necesarias > cantidad sugerida normal:
   → Elevar a unidades necesarias
   → Mostrar nota informativa
```

### Con Capacidad Maxima

El sistema limita la sugerencia si es necesario:

```
1. Calcular cantidad sugerida (puede ser elevada por minimo exhibicion)
2. Calcular espacio disponible = Capacidad Maxima - Stock Actual
3. Si cantidad sugerida > espacio disponible:
   → Ajustar a espacio disponible
   → Mostrar advertencia
```

### Orden de Aplicacion

Si un producto tiene ambos limites configurados:

1. Primero se aplica el minimo de exhibicion (elevar si es necesario)
2. Luego se aplica la capacidad maxima (limitar si excede)

---

## Advertencias en el Pedido

### Minimo de Exhibicion Aplicado

```
MINIMO EXHIBICION: Elevado para alcanzar 50 unidades
(minimo para que el producto se vea bien en exhibicion).
Stock actual: 20
```

### Capacidad Maxima Aplicada

```
CAPACIDAD LIMITADA: Ajustado de 350 a 150 unidades
por capacidad maxima de congelador (200 unid).
Stock actual: 50 | Espacio disponible: 150
```

---

## Ejemplos Practicos

### Ejemplo 1: Congelados en Tienda El Paraiso

**Situacion:**
- **Producto:** Helado Cremoso 1L
- **Tienda:** El Paraiso
- **Capacidad del congelador:** 200 unidades totales
- **Stock actual:** 50 unidades
- **Calculo ABC sugiere:** 350 unidades

**Calculo:**
```
Espacio disponible = 200 - 50 = 150 unidades
Cantidad sugerida original = 350 unidades
Cantidad ajustada = min(350, 150) = 150 unidades
```

**Resultado:** El sistema sugiere **150 unidades** (no 350) y muestra la advertencia explicando el ajuste.

### Ejemplo 2: Chocolates Clase D

**Situacion:**
- **Producto:** Chocolate Mini 30g
- **Clasificacion:** D (baja rotacion)
- **Minimo Exhibicion configurado:** 50 unidades
- **Stock actual:** 15 unidades
- **Calculo ABC sugiere:** 20 unidades (solo para cubrir demanda)

**Calculo:**
```
Unidades para minimo exhibicion = 50 - 15 = 35 unidades
Cantidad sugerida original (ABC) = 20 unidades
Como 35 > 20, elevar a 35 unidades
```

**Resultado:** El sistema sugiere **35 unidades** (no 20) para que el mostrador tenga el minimo de 50 unidades y se vea bien.

### Ejemplo 3: Producto con Ambos Limites

**Situacion:**
- **Producto:** Dulces Surtidos
- **Capacidad Maxima:** 100 unidades
- **Minimo Exhibicion:** 40 unidades
- **Stock actual:** 10 unidades
- **Calculo ABC sugiere:** 25 unidades

**Calculo:**
```
1. ABC sugiere: 25 unidades
2. Minimo exhibicion: 40 - 10 = 30 unidades necesarias
   Como 30 > 25, elevar a 30
3. Capacidad maxima: 100 - 10 = 90 espacio disponible
   Como 30 < 90, no se limita
4. Cantidad final: 30 unidades
```

**Resultado:** El sistema sugiere **30 unidades** (elevado por minimo exhibicion, dentro de capacidad maxima).

---

## Preguntas Frecuentes

### Que pasa si no configuro ningun limite?

El producto usara el calculo normal ABC sin restricciones. El sistema asume espacio ilimitado y sin requerimiento de exhibicion.

### Puedo configurar el mismo producto en varias tiendas?

Si. Cada tienda puede tener sus propios limites para el mismo producto.

### Los limites son por unidades o por bultos?

Por **unidades**. El sistema convierte automaticamente a bultos para la sugerencia final.

### Que pasa si el stock actual ya excede la capacidad maxima?

El sistema sugerira 0 unidades y mostrara un warning de sobrestock.

### Puedo configurar solo minimo exhibicion sin capacidad maxima?

Si. Puedes configurar uno o ambos limites segun necesites.

### Puedo eliminar una configuracion?

Si. En la tabla de configuraciones, haz click en el icono de eliminar. El producto volvera a usar el calculo normal sin limites.

### Si configuro ambos limites, cual se aplica primero?

Primero se aplica el minimo de exhibicion (elevar) y luego la capacidad maxima (limitar). Esto significa que si el minimo de exhibicion excede la capacidad maxima, la capacidad maxima tendra prioridad.

---

## Notas Importantes

1. **Solo afecta sugerencias:** Los limites son sugerencias inteligentes. El usuario puede modificar la cantidad manualmente si lo necesita.

2. **Stock actual se considera:** Ambos calculos consideran el stock actual:
   - Capacidad: `Espacio disponible = Capacidad - Stock actual`
   - Exhibicion: `Unidades necesarias = Minimo - Stock actual`

3. **Visible en el pedido:** Siempre veras claramente cuando un producto fue ajustado y por que limite.

4. **Configuracion por tienda:** Cada tienda tiene su propia configuracion. Un producto puede tener diferentes limites en cada tienda.

5. **Productos pequenos:** El minimo de exhibicion es especialmente util para productos pequenos de baja rotacion (clase C/D) que necesitan cantidad minima para que el mostrador se vea bien surtido.
