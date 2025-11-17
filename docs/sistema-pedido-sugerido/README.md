# Sistema de Pedido Sugerido - FluxionIA

Documentación completa del sistema inteligente de pedidos automáticos para La Granja Mercado.

## 📚 Documentos Disponibles

1. **[Introducción](01-INTRODUCCION.md)** - Qué es y cómo funciona el sistema
2. **[Lógica de Nivel Objetivo](02-LOGICA_NIVEL_OBJETIVO.md)** - Fórmulas y matemáticas del cálculo
3. **[Parámetros ABC-XYZ](03-PARAMETROS_ABC_XYZ.md)** - Configuración por tipo de producto
4. **[Guía de Configuración](04-CONFIGURACION.md)** - Cómo ajustar el sistema
5. **[Referencia de API](05-API_REFERENCE.md)** - Documentación técnica para desarrolladores

## 🚀 Inicio Rápido

Si eres **nuevo**, empieza aquí:
1. Lee la [Introducción](01-INTRODUCCION.md)
2. Comprende la [Lógica de Nivel Objetivo](02-LOGICA_NIVEL_OBJETIVO.md)
3. Revisa los [Parámetros ABC-XYZ](03-PARAMETROS_ABC_XYZ.md)

Si eres **comprador/gerente**:
- Ve directo a la [Guía de Configuración](04-CONFIGURACION.md)

Si eres **desarrollador**:
- Consulta la [Referencia de API](05-API_REFERENCE.md)

## ✨ Lo Más Importante

### Nivel Objetivo
```
Nivel Objetivo = Demanda durante Ciclo + Stock de Seguridad
```

### Cantidad Sugerida
```
Cantidad Sugerida = Nivel Objetivo - (Stock Actual + En Tránsito)
```

### Matriz ABC-XYZ
Cada producto se clasifica en 9 cuadrantes:
- **A, B, C** = Valor económico (Alto, Medio, Bajo)
- **X, Y, Z** = Variabilidad (Estable, Media, Errática)

## 📊 Resultados con Datos Reales

**Producto AX (Alto valor, estable)**
- Demanda: 1,800 unidades/día
- Nivel objetivo: 11,797 unidades
- Stock de seguridad: 7,296 unidades

**Producto BY (Medio valor, media variabilidad)**
- Demanda: 9,028 unidades/día
- Nivel objetivo: 62,279 unidades
- Stock de seguridad: 39,710 unidades

**Producto CZ (Bajo valor, errático)**
- Demanda: 5,602 unidades/día
- Nivel objetivo: 10,505 unidades
- Stock de seguridad: 0 unidades (sin SS)

---

**Última actualización:** 2025-01-12
**Versión del sistema:** 1.0.0
