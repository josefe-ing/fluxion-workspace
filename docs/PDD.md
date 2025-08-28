Fluxion AI - Product Definition Document (PDD)
MVP Scope & Features v3.0
Post-Demo Valencia + La Granja Insights

📋 Executive Summary
Producto: Sistema de gestión de inventario con IA proactiva para cadenas retail multi-tienda Propuesta de Valor: "De Reactivo a Proactivo" - Tu asistente de IA que previene problemas y captura oportunidades 24/7 Cliente Ancla: La Granja (29 tiendas, $12M USD/mes) Diferenciador Clave: AI Agent proactivo con decisiones tácticas/estratégicas ROI Validado: $67,500/semana en demo Valencia, 32-43x anual proyectado

🎯 MVP Scope Definition
Visión del Producto
Fluxion AI no es otro dashboard más. Es un agente de IA proactivo que:
🚨 Previene problemas antes de que ocurran
💰 Identifica oportunidades de ahorro y venta
🎯 Prioriza acciones por impacto económico
📊 Mide el valor generado en tiempo real
💬 Conversa naturalmente en español vía chat/WhatsApp
Métricas de Éxito MVP
✅ Valor generado medible: >$50K/semana
✅ Adopción: >80% usuarios activos diarios
✅ Precisión AI: >85% en predicciones
✅ Respuesta WhatsApp: <3 segundos
✅ ROI demostrable: <6 semanas payback

🚀 Core Features - MVP (3 meses)
FEATURE 1: AI Agent Panel - El Cerebro Proactivo 🤖
Prioridad: CRÍTICA | Sprint: 1
Descripción
Panel lateral inteligente que actúa como copiloto 24/7, monitoreando el negocio y sugiriendo acciones proactivamente.
Componentes del Agent Panel
1.1 Sistema de Alertas Inteligentes
ALERTAS = {
  "🔴 Críticas": [
    "Stockout inminente Harina PAN en 3 tiendas",
    "Cliente VIP Bodegón Central overdue 15 días",
    "Proveedor Polar sin confirmar orden urgente"
  ],
  "🟡 Oportunidades": [
    "Competencia sin stock de Aceite - captura demanda",
    "Descuento 15% en Nestlé hasta mañana",
    "5 clientes listos para reorden según patrones"
  ],
  "🔵 Insights": [
    "Patrón detectado: +40% ventas refrescos los viernes",
    "Navidad: preparar 3x inventario productos específicos",
    "Nuevo cliente potencial detectado en zona sur"
  ]
}
1.2 Decisiones Tácticas vs Estratégicas
Tácticas (1-3 días): "Transfiere 100 unidades de Tienda 3 a 7 HOY"
Estratégicas (2-3 meses): "Aumenta stock de temporada navideña 35%"
1.3 Chat AI Contextual
Conversación natural en español venezolano
Memoria de contexto de la sesión
Sugerencias rápidas basadas en contexto
Explicación del reasoning detrás de cada sugerencia
Criterios de Aceptación
[ ] Genera 20+ alertas relevantes diarias
[ ] Categorización automática por impacto
[ ] Respuesta chat <2 segundos
[ ] Precisión de alertas >90%
[ ] Acciones ejecutables con 1 click

FEATURE 2: Daily Action Center - Tu Lista de Comando 📋
Prioridad: CRÍTICA | Sprint: 1
Descripción
Centro de comando personalizado que prioriza exactamente qué hacer hoy para maximizar resultados.
Estructura de Acciones
interface DailyAction {
  id: string;
  tipo: 'critica' | 'oportunidad' | 'optimizacion';
  titulo: string;
  descripcion: string;
  impacto_economico: number;  // en USD
  tiempo_requerido: number;    // minutos
  deadline: Date;
  auto_ejecutable: boolean;
  confianza: number;           // 0-100%
  source: 'ai_prediction' | 'rule_based' | 'user_pattern';
}

// Ejemplo real
{
  tipo: "oportunidad",
  titulo: "Reorden anticipado de Harina PAN",
  descripcion: "Basado en patrón de quincena, ordenar 500 unidades adicionales",
  impacto_economico: 3500,
  tiempo_requerido: 5,
  deadline: "2025-01-14 14:00",
  auto_ejecutable: true,
  confianza: 92
}
Métricas de Valor
Esta Semana: $67,500 generado
Este Mes: $245,000 generado
Acciones Completadas: 87/95 (92%)
Tiempo Ahorrado: 45 horas

FEATURE 3: WhatsApp Business Integration 📱
Prioridad: CRÍTICA | Sprint: 1-2
Descripción
Bot de WhatsApp 24/7 que permite gestionar inventario conversacionalmente desde cualquier lugar.
Capacidades del Bot
3.1 Consultas de Inventario
Usuario: "Cuanto tengo de harina pan?"
Bot: "📦 Harina PAN 1kg:
• Tienda Centro: 145 unidades
• Tienda Sur: 78 unidades ⚠️ (bajo)
• Tienda Norte: 234 unidades
• Almacén: 1,200 unidades
Total: 1,657 unidades (5.2 días de inventario)"
3.2 Alertas Proactivas
Bot: "🚨 ALERTA CRÍTICA
3 productos en riesgo de stockout mañana:
1. Aceite Maíz - Tienda Sur
2. Azúcar 1kg - Tienda Centro
3. Café Madrid - Tienda Norte

¿Autorizo transferencias de emergencia? 
Responde SI para ejecutar"
3.3 Ejecución de Acciones
Usuario: "Transfiere 50 aceite de norte a sur"
Bot: "✅ Transferencia programada:
• 50 unidades Aceite Maíz
• De: Tienda Norte → Tienda Sur
• Llegada estimada: Mañana 10am
• Costo transporte: $12
• Ahorro por prevenir stockout: $340

Transferencia #TRF-2025-0145 creada"
Métricas WhatsApp
Consultas/día: 47 promedio
Tiempo respuesta: 2.3 segundos
Precisión: 94%
Usuarios activos: 28/35 gerentes

FEATURE 4: Purchase Intelligence - Compras Inteligentes 📦
Prioridad: ALTA | Sprint: 2
Descripción
Sistema que optimiza compras considerando demanda futura, precios, lead times y restricciones de proveedores.
Recomendaciones de Compra
{
  "fecha_analisis": "2025-01-14",
  "recomendaciones": [
    {
      "producto": "Harina PAN 1kg",
      "prioridad": "CRITICA",
      "cantidad_sugerida": 5000,
      "proveedor_primario": "Empresas Polar",
      "precio_actual": 1.20,
      "precio_promedio": 1.35,
      "ahorro": 750,
      "lead_time": 3,
      "razon": "Quincena + precio bajo histórico",
      "confianza": 95,
      "roi": "43% en 7 días"
    }
  ],
  "inversion_total": 45600,
  "ahorro_proyectado": 8900,
  "productos_criticos": 3,
  "productos_oportunidad": 12
}
Validaciones Automáticas
✅ Mínimos de proveedor (MOQ)
✅ Presupuesto disponible
✅ Capacidad de almacenamiento
✅ Fechas de vencimiento
✅ Descuentos por volumen

FEATURE 5: Multi-Store Dashboard 🏪
Prioridad: ALTA | Sprint: 3
Descripción
Vista consolidada de todas las tiendas con drill-down específico y comparativas.
Vistas Principales
7.1 Mapa de Calor Nacional
Mapa de Venezuela con las 29 tiendas
Colores por estado: 🟢 Óptimo 🟡 Alerta 🔴 Crítico
Hover: métricas clave de cada tienda
Click: drill-down a tienda específica
7.2 Comparativa Multi-Tienda
{
  "mejores_performers": [
    {"tienda": "Valencia Centro", "score": 94, "roi": 165},
    {"tienda": "Maracay Norte", "score": 91, "roi": 148}
  ],
  "necesitan_atencion": [
    {"tienda": "Caracas Sur", "issue": "5 stockouts esta semana"},
    {"tienda": "Puerto Ordaz", "issue": "Exceso inventario +$45K"}
  ],
  "oportunidades_transferencia": [
    {
      "desde": "Valencia Centro",
      "hacia": "Valencia Sur",
      "productos": 12,
      "ahorro": 3400
    }
  ]
}
7.3 Métricas Consolidadas
Capital total en inventario: $4.2M
Rotación promedio: 8.7
Fill rate network: 94%
Tiendas en riesgo: 3/29

🔌 Integraciones POS - MVP
Sistemas POS Objetivo
1. Stellar POS 🌟
Sistema más usado en retail venezolano
Integración vía:
Acceso directo a base de datos SQL Server
Conexión read-only a tablas específicas
Sincronización cada 15 minutos
Datos a extraer:
-- Tablas principales Stellar
- dbo.Inventario (stock actual)
- dbo.Ventas (transacciones)
- dbo.Productos (catálogo)
- dbo.Movimientos (transferencias)
- dbo.Proveedores (suppliers)
Mapeo de campos críticos:
stellar_mapping = {
    "CodProd": "product_id",
    "Descrip": "product_name", 
    "Existencia": "quantity_on_hand",
    "CodUbic": "store_id",
    "PrecioVenta": "retail_price",
    "CostoActual": "cost_price"
}
2. Odoo ERP 📊
Popular en empresas medianas
Integración vía:
API REST nativa de Odoo
XML-RPC para operaciones específicas
Webhooks para eventos real-time
Endpoints principales:
odoo_endpoints = {
    "inventory": "/api/stock.quant",
    "sales": "/api/sale.order",
    "products": "/api/product.product",
    "warehouses": "/api/stock.warehouse",
    "moves": "/api/stock.move"
}
Sincronización:
Pull cada 30 minutos para inventario
Webhooks para ventas en tiempo real
Batch nocturno para reconciliación
3. Profit Plus 💼
Sistema administrativo venezolano
Integración vía:
Acceso a base de datos SQL (generalmente SQL Server 2008/2012)
Vistas personalizadas para no afectar performance
ETL nocturno + updates incrementales
Tablas clave Profit:
-- Estructura típica Profit Plus
- SINV_Articulos (productos)
- SINV_Almacenes (stores/warehouses)
- SINV_Stock_Almacen (inventario por ubicación)
- SVEN_Facturas (ventas)
- SVEN_Facturas_Reng (detalle ventas)
- SCOM_Ordenes_Compra (purchase orders)
Consideraciones especiales:
Maneja multi-moneda (Bs y USD)
Campos de precios múltiples (Precio1...Precio5)
Integración con módulo de importaciones
Arquitectura de Integración
graph LR
    subgraph "Sistemas POS"
        STELLAR[Stellar DB]
        ODOO[Odoo API]
        PROFIT[Profit DB]
    end
    
    subgraph "Fluxion Integration Layer"
        CONNECTOR[POS Connectors]
        TRANSFORM[Data Transform]
        VALIDATE[Validation]
        QUEUE[Kafka Queue]
    end
    
    subgraph "Fluxion Core"
        API[Fluxion API]
        DB[(PostgreSQL)]
    end
    
    STELLAR --> CONNECTOR
    ODOO --> CONNECTOR
    PROFIT --> CONNECTOR
    CONNECTOR --> TRANSFORM
    TRANSFORM --> VALIDATE
    VALIDATE --> QUEUE
    QUEUE --> API
    API --> DB
Data Sync Strategy
sync_configuration:
  stellar:
    inventory:
      frequency: "*/15 * * * *"  # Cada 15 minutos
      mode: "incremental"
      priority: "high"
    sales:
      frequency: "*/5 * * * *"   # Cada 5 minutos
      mode: "incremental"
      priority: "critical"
    products:
      frequency: "0 2 * * *"     # 2 AM diario
      mode: "full"
      priority: "low"
  
  odoo:
    inventory:
      frequency: "*/30 * * * *"  # Cada 30 minutos
      mode: "api_pull"
      priority: "high"
    sales:
      frequency: "webhook"       # Real-time
      mode: "push"
      priority: "critical"
  
  profit:
    inventory:
      frequency: "*/60 * * * *"  # Cada hora
      mode: "incremental"
      priority: "medium"
    sales:
      frequency: "*/30 * * * *"  # Cada 30 minutos
      mode: "incremental"
      priority: "high"
    full_sync:
      frequency: "0 3 * * *"     # 3 AM diario
      mode: "full"
      priority: "low"
Mapeo de Datos Unificado
interface UnifiedProduct {
  // IDs únicos por sistema
  internal_id: string;          // Fluxion ID
  stellar_id?: string;          // CodProd
  odoo_id?: number;             // product.id
  profit_id?: string;           // co_art
  
  // Datos básicos
  sku: string;
  name: string;
  barcode?: string;
  category: string;
  
  // Inventario consolidado
  inventory_by_location: {
    location_id: string;
    quantity_on_hand: number;
    quantity_available: number;
    last_updated: Date;
    source_system: 'stellar' | 'odoo' | 'profit';
  }[];
  
  // Precios (multi-moneda)
  prices: {
    currency: 'USD' | 'VES';
    cost: number;
    retail: number;
    wholesale?: number;
    last_updated: Date;
  }[];
}
Manejo de Conflictos
conflict_resolution_rules = {
    "inventory_mismatch": {
        "strategy": "use_most_recent",
        "alert": True,
        "log": True
    },
    "price_difference": {
        "strategy": "use_primary_system",  # Stellar > Odoo > Profit
        "threshold": 0.05,  # 5% diferencia
        "alert": True
    },
    "product_not_found": {
        "strategy": "create_placeholder",
        "notify": True,
        "require_manual_review": True
    }
}
📊 Arquitectura de Datos para MVP
Fuentes de Datos Post-Integración
Ventas (de POS):
  - Transacciones en tiempo real/near real-time
  - Histórico 12+ meses para ML
  - Detalle por SKU, tienda, fecha, hora
  
Inventario (de POS):
  - Stock actual por ubicación
  - Movimientos y transferencias
  - Ajustes y mermas
  
Maestros (de POS):
  - Catálogo de productos
  - Información de tiendas/almacenes
  - Datos de proveedores
  
Adicionales (manuales/API):
  - Lead times de proveedores
  - MOQs y restricciones
  - Calendarios y eventos
Modelos de ML Requeridos
Demand Forecasting: Prophet + ARIMA ensemble
Cliente Churn: Random Forest
Anomaly Detection: Isolation Forest
Price Optimization: Regression models
Inventory Optimization: Linear programming

🎯 Roadmap de Desarrollo MVP
Sprint 0: Setup (1 semana)
[x] Arquitectura base multi-tenant
[x] Autenticación y seguridad
[ ] CI/CD pipeline
[ ] Ambientes dev/staging
Sprint 1-2: Core AI (4 semanas)
[ ] AI Agent Panel funcional
[ ] Daily Action Center
[ ] Chat AI básico
[ ] Mock data realista venezolano
Sprint 3-4: WhatsApp + Intelligence (4 semanas)
[ ] WhatsApp Business API integration
[ ] Purchase Intelligence
[ ] Client Intelligence
[ ] Primeras predicciones ML
Sprint 5-6: Value + Scale (4 semanas)
[ ] ROI Tracker completo
[ ] Multi-store dashboard
[ ] Optimización de transferencias
[ ] Integraciones POS reales

📈 Métricas de Éxito
Técnicas
Response time: <2s (web), <3s (WhatsApp)
Uptime: 99.9%
Prediction accuracy: >85%
Alerta false positive rate: <10%
Negocio
Valor generado semanal: >$50K
ROI: >30x anual
Reducción stockouts: >40%
Reducción inventario: >20%
Adopción
Daily Active Users: >80%
WhatsApp queries/día: >50
Acciones ejecutadas: >70%
NPS: >60

💡 Lecciones Clave de los Demos
De Demo Valencia:
AI Agent Panel es el verdadero diferenciador
ROI Tracker con números reales cierra ventas
WhatsApp es crítico para adopción
Decisiones tácticas vs estratégicas resuenan con gerentes
De Demo La Granja:
Multi-tienda es complejidad que nadie más resuelve bien
Español natural es mandatorio
Simplicidad sobre features complejos
Valor visible desde día 1

✅ Definition of Done - MVP
El MVP está listo cuando:
[ ] AI Agent genera 20+ alertas útiles diarias
[ ] WhatsApp responde en <3 segundos
[ ] ROI Tracker muestra valor real generado
[ ] 3 tiendas piloto por 2 semanas
[ ] 80% usuarios activos diarios
[ ] Documentación y training en español
[ ] Cliente puede presentar ROI a su board

Documento actualizado post-demos Valencia + La Granja Próxima revisión: Post-implementación MVP Versión: 3.0

