# 🎯 ESTRATEGIA DE DEMOS - FLUXION AI

## 📊 Sistema de Demos Multi-Cliente

### Estructura de Demos
```
demos/
├── clients/                    # Demos personalizadas por cliente
│   ├── la-granja/             # Demo para La Granja
│   │   ├── config.json        # Configuración específica
│   │   ├── data.json          # Datos del cliente
│   │   └── README.md          # Notas del cliente
│   │
│   ├── distribuidora-valencia/ # Demo para Dist. Valencia
│   │   ├── config.json
│   │   ├── data.json
│   │   └── README.md
│   │
│   ├── farmacia-saas/         # Demo para Farmacias
│   │   └── ...
│   │
│   └── _template/             # Template para nuevo cliente
│       ├── config.json
│       ├── data.json
│       └── README.md
│
├── templates/                  # Componentes reusables
│   ├── dashboard-standalone/  # Dashboard sin backend
│   ├── full-system/          # Sistema completo
│   └── mobile-whatsapp/      # Demo WhatsApp
│
└── data/                      # Datos compartidos
    ├── products-vzla.json     # Productos venezolanos
    ├── suppliers.json         # Proveedores comunes
    └── scenarios/             # Escenarios de demo
```

## 🎪 Tipos de Demo

### 1. DEMO RÁPIDA (5 minutos)
**Para**: Primer contacto, ferias, encuentros casuales
**Formato**: Dashboard standalone en tablet/laptop
**Sin requisitos**: No necesita internet ni backend

```bash
make demo-quick CLIENT=la-granja
# Abre dashboard con datos del cliente
# Todo funciona con datos mockeados
```

### 2. DEMO EJECUTIVA (15-20 minutos)
**Para**: Reunión con decisores
**Formato**: Dashboard + AI insights en tiempo real
**Requisitos**: Laptop con Docker

```bash
make demo-executive CLIENT=distribuidora-valencia
# Inicia backend ligero + dashboard
# Simula insights en tiempo real
# WhatsApp bot demo opcional
```

### 3. DEMO TÉCNICA (30-45 minutos)
**Para**: Equipo técnico del cliente
**Formato**: Sistema completo
**Requisitos**: Internet, laptop potente

```bash
make demo-full CLIENT=farmacia-saas
# Sistema completo con todas las integraciones
# Muestra arquitectura y escalabilidad
# API documentation
```

## 📝 Configuración por Cliente

### `clients/{nombre}/config.json`
```json
{
  "client": {
    "name": "La Granja Distribuidora C.A.",
    "contact": "Juan Pérez",
    "industry": "wholesale_food",
    "size": "medium",
    "location": "Valencia, Venezuela"
  },
  "demo": {
    "type": "executive",
    "duration": "20min",
    "focus": ["inventory_alerts", "seasonal_insights", "roi_tracking"],
    "language": "es-VE",
    "currency": "Bs",
    "timezone": "America/Caracas"
  },
  "customization": {
    "logo": "assets/la-granja-logo.png",
    "primaryColor": "#2B7A3B",
    "companyMetrics": {
      "warehouses": 1,
      "stores": 3,
      "skus": 1200,
      "monthlyRevenue": 850000000,
      "clients": 450
    }
  },
  "features": {
    "showWhatsApp": true,
    "showPOSIntegration": true,
    "showMLForecasting": true,
    "showROIDashboard": true
  },
  "scenarios": [
    "stockout_crisis",
    "seasonal_opportunity",
    "client_churn_risk"
  ]
}
```

### `clients/{nombre}/data.json`
```json
{
  "products": [
    {
      "sku": "HAR-PAN-001",
      "name": "Harina PAN 1kg",
      "category": "Alimentos Básicos",
      "currentStock": 450,
      "minStock": 200,
      "maxStock": 1000,
      "dailyAverage": 85,
      "supplier": "Empresas Polar",
      "leadTime": 3,
      "lastPrice": 18500,
      "margin": 0.22
    }
  ],
  "clients": [
    {
      "id": "CLI-001",
      "name": "Supermercado El Valle",
      "type": "supermarket",
      "creditLimit": 5000000,
      "paymentTerms": 30,
      "averageOrder": 850000,
      "orderFrequency": 7,
      "lastOrder": "2024-10-20",
      "status": "active"
    }
  ],
  "alerts": [
    {
      "type": "stockout",
      "priority": "critical",
      "product": "Aceite Mazeite 1L",
      "message": "Stock crítico - Solo 15 unidades",
      "action": "Ordenar 500 unidades urgente",
      "impact": "Pérdida potencial Bs 450,000"
    }
  ]
}
```

## 🚀 Comandos de Demo

### Crear Nueva Demo Cliente
```bash
make new-demo CLIENT=nombre-cliente
# Copia template y abre editor para personalizar
```

### Listar Demos Disponibles
```bash
make list-demos
# Muestra todos los clientes configurados
```

### Iniciar Demo
```bash
make demo CLIENT=la-granja TYPE=quick
make demo CLIENT=la-granja TYPE=executive
make demo CLIENT=la-granja TYPE=full
```

### Actualizar Datos de Demo
```bash
make update-demo CLIENT=la-granja
# Regenera datos realistas para el cliente
```

### Exportar Demo
```bash
make export-demo CLIENT=la-granja
# Crea ZIP/imagen Docker para llevar
```

## 📱 Demo WhatsApp

### Números de Prueba por Cliente
- La Granja: +58 424-GRANJA1
- Dist. Valencia: +58 424-DISTRI1
- Farmacia SaaS: +58 424-FARMA01

### Comandos Preconfigurados
```
"inventario harina pan" → Muestra stock actual
"alertas críticas" → Lista problemas urgentes
"predicción octubre" → Forecast del mes
"ordenar aceite 100" → Simula orden de compra
```

## 💾 Gestión de Estado de Demos

### Guardar Estado
```bash
make demo-save CLIENT=la-granja NAME=reunion-octubre
# Guarda estado actual de la demo
```

### Restaurar Estado
```bash
make demo-restore CLIENT=la-granja NAME=reunion-octubre
# Restaura demo a punto específico
```

### Histórico de Demos
```bash
make demo-history CLIENT=la-granja
# Lista todas las demos realizadas con notas
```

## 📈 Métricas de Demo

El sistema trackea automáticamente:
- Duración de cada demo
- Features más usadas
- Preguntas frecuentes
- Tasa de conversión por tipo de demo
- Feedback del cliente

## 🎯 Scripts de Demo Guiada

### `demos/scripts/executive-script.md`
```markdown
# GUIÓN DEMO EJECUTIVA - 20 minutos

## Apertura (2 min)
- Problema del sector: Gestión reactiva vs proactiva
- Costo de stockouts y sobrestock
- Mostrar dashboard actual del cliente (si tiene)

## Demostración (15 min)

### Parte 1: Crisis en Tiempo Real (5 min)
1. Mostrar alerta crítica de stockout
2. Ver impacto financiero
3. Ejecutar acción recomendada
4. Mostrar WhatsApp notification

### Parte 2: Inteligencia Predictiva (5 min)
1. Predicción Halloween/Navidad
2. Recomendación de compra
3. ROI proyectado
4. Comparación con año anterior

### Parte 3: Optimización Multi-tienda (5 min)
1. Desbalance de inventario
2. Transferencia automática sugerida
3. Ahorro en costos logísticos
4. Cliente satisfaction score

## Cierre (3 min)
- ROI esperado en 6 semanas
- Proceso de implementación
- Pricing personalizado
- Q&A
```

## 🔧 Configuración Técnica

### Variables de Entorno por Demo
```bash
# .env.la-granja
DEMO_MODE=true
CLIENT_ID=la-granja
API_MOCK=true
REALTIME_SIMULATION=true
WHATSAPP_SANDBOX=true
```

### Docker Compose para Demos
```yaml
# docker-compose.demo.yml
version: '3.8'
services:
  demo-backend:
    image: fluxion/demo-backend:latest
    environment:
      - DEMO_MODE=true
      - CLIENT_CONFIG=/data/config.json
    volumes:
      - ./demos/clients/${CLIENT}:/data
    ports:
      - "3000:3000"
  
  demo-dashboard:
    image: fluxion/demo-dashboard:latest
    environment:
      - REACT_APP_DEMO_MODE=true
      - REACT_APP_CLIENT=${CLIENT}
    ports:
      - "8080:80"
```

## 📊 Análisis Post-Demo

### Reporte Automático
Después de cada demo se genera:
- Grabación de pantalla (opcional)
- Métricas de interacción
- Preguntas del cliente
- Features más interesantes
- Siguiente paso recomendado

### CRM Integration
```bash
make demo-report CLIENT=la-granja
# Sube reporte a HubSpot/Salesforce
# Programa follow-up automático
# Envía materiales relevantes
```

## 🎨 Personalización Visual

Cada demo puede tener:
- Logo del cliente
- Colores corporativos
- Productos reales del cliente
- Proveedores conocidos
- Métricas actuales para comparar

## 🚨 Modo Emergencia

Si algo falla durante la demo:
```bash
make demo-fallback CLIENT=la-granja
# Activa versión 100% offline
# Todo funciona con datos locales
# Sin dependencias externas
```

## 📅 Calendario de Demos

```bash
make demo-schedule
# Muestra próximas demos programadas
# Prepara datos actualizados
# Envía recordatorios
```

## 🎁 Material de Seguimiento

Después de cada demo, generar:
1. **One-pager** personalizado (PDF)
2. **Video** de 2 minutos con highlights
3. **Calculadora ROI** en Excel
4. **Propuesta técnica** (si solicitada)
5. **Acceso a sandbox** por 7 días

## 💡 Tips para Demos Exitosas

1. **Siempre** tener modo offline listo
2. **Personalizar** con datos del cliente
3. **Empezar** con problema conocido
4. **Mostrar** ROI en términos locales
5. **Dejar** algo funcionando (sandbox)
6. **Seguimiento** en menos de 24 horas