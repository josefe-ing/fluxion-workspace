---
slug: /
sidebar_position: 1
title: Introducción
---

# Bienvenido a Fluxion AI

**Fluxion AI** es un sistema de gestión de inventario con inteligencia artificial proactiva, diseñado específicamente para distribuidores mayoristas B2B.

## ¿Qué es Fluxion AI?

Fluxion AI transforma la manera en que gestionas tu inventario. En lugar de reaccionar ante problemas como quiebres de stock o sobre-inventario, nuestro sistema te anticipa lo que necesitas hacer **antes** de que ocurran los problemas.

### Características Principales

- **Análisis de Ventas en Tiempo Real** - Visualiza el comportamiento de ventas por tienda, producto y período
- **Gestión de Inventario Inteligente** - Monitorea niveles de stock con alertas automáticas
- **Clasificación ABC/XYZ** - Identifica tus productos más importantes y su variabilidad de demanda
- **Pedidos Sugeridos** - Genera órdenes de compra optimizadas basadas en datos históricos
- **Panel de Administración** - Controla la sincronización de datos y configuraciones del sistema

## ¿Para quién es Fluxion AI?

Fluxion AI está diseñado para:

- **Gerentes de Compras** que necesitan optimizar sus pedidos
- **Analistas de Inventario** que buscan reducir quiebres de stock
- **Gerentes de Tienda** que quieren entender el rendimiento de sus productos
- **Directivos** que requieren visibilidad del negocio en tiempo real

## Arquitectura del Sistema

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Fuentes de    │────▶│   Motor ETL     │────▶│   Base de       │
│   Datos (ERP)   │     │   Fluxion       │     │   Datos OLAP    │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              │
                        │   Dashboard     │◀─────────────┘
                        │   Fluxion AI    │
                        └─────────────────┘
```

## Próximos Pasos

<div className="row">
  <div className="col col--6">
    <div className="card">
      <div className="card__header">
        <h3>🚀 Guía de Inicio Rápido</h3>
      </div>
      <div className="card__body">
        <p>Aprende a navegar el sistema y realizar tus primeras consultas.</p>
      </div>
      <div className="card__footer">
        <a className="button button--primary button--block" href="/getting-started/quick-start">Comenzar</a>
      </div>
    </div>
  </div>
  <div className="col col--6">
    <div className="card">
      <div className="card__header">
        <h3>📚 Conceptos Clave</h3>
      </div>
      <div className="card__body">
        <p>Entiende los conceptos fundamentales detrás de Fluxion AI.</p>
      </div>
      <div className="card__footer">
        <a className="button button--secondary button--block" href="/getting-started/conceptos-clave">Aprender</a>
      </div>
    </div>
  </div>
</div>

## Soporte

¿Tienes preguntas? Contáctanos en [soporte@fluxionia.co](mailto:soporte@fluxionia.co)
