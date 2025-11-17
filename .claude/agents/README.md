# Agentes Especializados de Fluxion AI

Este directorio contiene prompts de agentes especializados para trabajar eficientemente en diferentes áreas del proyecto Fluxion AI.

## 🎯 ¿Cómo usar estos agentes?

Cuando trabajes con Claude Code, puedes pedirle que "actúe como" uno de estos agentes para obtener ayuda especializada en un área específica.

**Ejemplo de uso**:
```
"Actúa como Mateo (Supply Chain Expert) y ayúdame a revisar la lógica de pedidos sugeridos"
```

## 👥 Lista de Agentes

### 1. **Mateo** - Supply Chain & Inventory Expert 📦
**Archivo**: `mateo-supply-chain.md`

**Especialidad**:
- Lógica de pedidos sugeridos
- Clasificación ABC-XYZ
- Optimización de inventario multi-tienda
- Forecasting de demanda
- Parámetros de reposición (stock mínimo, máximo, punto de reorden)

**Cuándo consultar a Mateo**:
- ✅ Validar fórmulas de cálculo de pedidos
- ✅ Optimizar parámetros de inventario
- ✅ Diseñar lógica de transferencias entre tiendas
- ✅ Analizar problemas de stockouts o sobre-stock
- ✅ Definir reglas de negocio para reposición

**Ejemplo**: "Mateo, ¿esta fórmula de cantidad sugerida tiene sentido para productos C?"

---

### 2. **Diego** - Backend Python/DuckDB Architect 🐍
**Archivo**: `diego-backend.md`

**Especialidad**:
- Python 3.14 + FastAPI
- DuckDB queries y optimización
- Diseño de routers y endpoints
- ETL pipelines
- Auth y multi-tenancy

**Cuándo consultar a Diego**:
- ✅ Implementar nuevos endpoints
- ✅ Optimizar queries DuckDB lentos
- ✅ Refactorizar código backend
- ✅ Resolver errores de ETL
- ✅ Diseñar arquitectura de nuevas features

**Ejemplo**: "Diego, ¿cómo optimizar este query que toma 30 segundos?"

---

### 3. **Sofía** - Frontend React/TypeScript Architect ⚛️
**Archivo**: `sofia-frontend.md`

**Especialidad**:
- React 18 + TypeScript
- Componentes complejos (wizards, modales, tablas)
- Tailwind CSS
- State management con hooks
- Performance optimization

**Cuándo consultar a Sofía**:
- ✅ Diseñar nuevos componentes
- ✅ Resolver problemas de TypeScript
- ✅ Optimizar re-renders
- ✅ Crear wizards multi-paso
- ✅ Mejorar UX/UI

**Ejemplo**: "Sofía, ¿cómo estructurar este wizard de 5 pasos?"

---

### 4. **Lucía** - Product Manager & Business Strategy 💼
**Archivo**: `lucia-product.md`

**Especialidad**:
- Priorización de features (RICE, ICE)
- Roadmap de producto
- Métricas de negocio y ROI
- User stories y requirements
- Estrategia de mercado

**Cuándo consultar a Lucía**:
- ✅ Priorizar entre múltiples features
- ✅ Validar si una feature agrega valor
- ✅ Definir métricas de éxito
- ✅ Escribir user stories
- ✅ Decisiones de producto

**Ejemplo**: "Lucía, ¿deberíamos priorizar WhatsApp o reportes avanzados?"

---

### 5. **Ana** - Data Engineer & ML Specialist 📊
**Archivo**: `ana-data-ml.md`

**Especialidad**:
- ETL pipelines con Python
- Analytics con DuckDB
- Machine Learning (Prophet, clasificación)
- Clasificación ABC-XYZ
- Data quality y validaciones

**Cuándo consultar a Ana**:
- ✅ Optimizar ETL que toma mucho tiempo
- ✅ Implementar forecasting
- ✅ Queries analíticos complejos
- ✅ Clasificación automática de productos
- ✅ Validar calidad de datos

**Ejemplo**: "Ana, ¿qué modelo usar para forecast de demanda?"

---

### 6. **Rafael** - DevOps & Infrastructure Engineer 🚀
**Archivo**: `rafael-devops.md`

**Especialidad**:
- AWS (ECS, EC2, S3, VPN)
- Docker y containerización
- CI/CD con GitHub Actions
- Monitoring (Sentry, CloudWatch)
- Backups y disaster recovery

**Cuándo consultar a Rafael**:
- ✅ Problemas de deployment
- ✅ Configurar monitoring
- ✅ Setup de VPN
- ✅ Optimizar costos de AWS
- ✅ Backups y recovery

**Ejemplo**: "Rafael, backend en ECS no responde, ¿qué revisar?"

---

## 🎭 Guía de Decisión: ¿A quién consultar?

### Por tipo de problema:

**Lógica de Negocio**:
- Inventario/Supply Chain → **Mateo**
- Producto/Estrategia → **Lucía**

**Implementación Técnica**:
- Backend/API → **Diego**
- Frontend/UI → **Sofía**
- ETL/Analytics → **Ana**
- Infraestructura → **Rafael**

**Por stack tecnológico**:
- Python + FastAPI → **Diego**
- React + TypeScript → **Sofía**
- DuckDB queries → **Diego** o **Ana**
- AWS → **Rafael**
- Machine Learning → **Ana**

**Por fase de desarrollo**:
- Discovery/Planning → **Lucía**
- Design → **Mateo** (negocio) o **Sofía** (UI)
- Implementation → **Diego**, **Sofía**, **Ana**
- Deployment → **Rafael**
- Optimization → Todos según el área

---

## 💡 Tips de Uso

1. **Sé específico**: "Diego, ayúdame con este query" es mejor que "Ayuda con backend"

2. **Combina agentes**: Puedes pedir opiniones de múltiples agentes
   - Ejemplo: "Mateo, valida esta lógica. Luego Diego, impleméntala"

3. **Contexto es clave**: Los agentes conocen el proyecto, pero ayuda darles contexto específico
   - ✅ "Mateo, en pedidos sugeridos para tienda 5..."
   - ❌ "Mateo, revisa esto"

4. **Usa nombres**: Referirte a los agentes por nombre ayuda a Claude entender mejor
   - "Pregúntale a Sofía sobre componentes"
   - "Mateo puede ayudarte con eso"

---

## 🔄 Workflow Recomendado

### Ejemplo: Nueva Feature "Alertas de Sobre-Stock"

1. **Lucía** (Product): ¿Vale la pena? ¿Qué métricas?
2. **Mateo** (Supply Chain): ¿Qué define sobre-stock? ¿Qué umbrales?
3. **Ana** (Data): Query para detectar sobre-stock
4. **Diego** (Backend): Endpoint `/api/alertas/sobre-stock`
5. **Sofía** (Frontend): Componente AlertaSobreStock
6. **Rafael** (DevOps): Deploy y monitoring

---

## 📝 Notas

- Estos agentes son **prompts especializados**, no servicios separados
- Todos tienen **contexto completo del proyecto** Fluxion AI
- Están diseñados para **trabajar juntos**
- Se actualizan conforme el proyecto evoluciona

---

## 🚀 Quick Start

```bash
# Ejemplo de conversación con Claude Code

Usuario: "Necesito optimizar el sistema de pedidos sugeridos"

Claude: "Entiendo. Para esto, te recomiendo consultar a:
- Mateo para revisar la lógica de negocio
- Diego para optimizar el backend
- Sofía para mejorar la UI

¿Por dónde quieres empezar?"

Usuario: "Empecemos con Mateo"

Claude: [Actúa como Mateo]
"Hola, soy Mateo. Hablemos de pedidos sugeridos.
Cuéntame qué aspecto específico quieres optimizar..."
```

---

**Última actualización**: Noviembre 2024
**Versión**: 1.0
