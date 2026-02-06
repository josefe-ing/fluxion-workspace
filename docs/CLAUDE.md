# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fluxion AI** is a sophisticated inventory management system with proactive AI intelligence for Venezuelan B2B wholesale distributors. The project consists of:

1. **Dashboard Client** (`dashboard-client/` and `fluxionai-dashboard-client/`) - React-based demo dashboards
2. **Documentation** (`docs/`) - Comprehensive system architecture and development plans
3. **Full System Architecture** - Multi-service platform for real inventory management (documented, not implemented)

## Tech Stack

### Current Implementation (Demo Dashboards)
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom B2B color scheme
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **Data**: Mock JSON data with Venezuelan business context

### Planned Full System (from Architecture docs)
- **Backend**: Node.js + Express + TypeScript
- **AI Engine**: Python + FastAPI with multi-agent system
- **Database**: PostgreSQL + TimescaleDB + Redis
- **Message Queue**: Apache Kafka
- **Deployment**: Kubernetes (cloud-agnostic)

## Common Commands

### Dashboard Development
```bash
# Navigate to dashboard client
cd dashboard-client  # or fluxionai-dashboard-client

# Development
npm run dev              # Start development server (port 3000)
npm run build           # Standard production build to dist/
npm run build-single    # Single HTML file build to demo/index.html
npm run preview         # Preview production build

# Quality Control
npm run lint            # ESLint check
npm run type-check      # TypeScript type checking
```

## Architecture Overview

### Current Demo Architecture
The dashboard clients are sophisticated React SPAs designed for executive-level presentations to Venezuelan wholesale distributors:

**Component Structure:**
- `src/App.tsx` - Main application with tabbed navigation (Daily Actions, Purchase Intelligence, Client Intelligence, etc.)
- `src/components/AIAgentPanel.tsx` - **Centerpiece** - Real-time AI notifications panel
- `src/components/PurchaseIntelligence.tsx` - Container purchase recommendations with Venezuelan product context
- `src/components/ClientIntelligence.tsx` - Customer behavior predictions and overdue detection
- `src/components/MainDashboard.tsx` - Executive KPI cards and warehouse visualization

**Data Architecture:**
- `src/types/index.ts` - Comprehensive TypeScript interfaces
- `src/data/mockData.ts` - Realistic Venezuelan business data (Pringles, Oreo, Red Bull, etc.)
- State management via React useState (appropriate for demo complexity)

### Planned Production Architecture (Multi-Agent AI System)

Based on comprehensive documentation in `docs/`, the full system follows a microservices pattern with:

**Core Services:**
1. **Backend Monolith** (Node.js) - API layer, auth, multi-tenancy
2. **AI Engine** (Python) - Multi-agent system with specialized agents:
   - **Alert Agent**: Stockout detection, anomaly identification
   - **Forecast Agent**: Demand prediction using Prophet/ARIMA
   - **Optimizer Agent**: Inventory optimization, transfer recommendations
   - **Chat Agent**: Conversational interface with business context

**Communication Patterns:**
- Synchronous: REST API for real-time user queries
- Asynchronous: Kafka for batch analysis and background processing
- Event-driven: Internal event bus for service coordination

**Data Layer:**
- PostgreSQL with TimescaleDB for time-series data
- Redis for caching and pub/sub
- Multi-tenant architecture with schema separation

## Key Features & Business Context

### Demo Dashboards
The dashboards simulate a real Venezuelan wholesale distributor (Maxy Sweet C.A. - Freddy Da Silva):
- **Inventory**: $12.3M, 1,850 SKUs, Valencia warehouse
- **Clients**: 542 active wholesale clients nationwide
- **Products**: Local context (Harina PAN, Venezuelan brands) + international (Pringles, Oreo)
- **AI Notifications**: Proactive alerts with business reasoning and ROI calculations

**Key Demo Features:**
1. **AI Agent Panel**: Critical stockout alerts, seasonal opportunities (Halloween +280% chocolates), client risk detection
2. **Supply Chain Reality**: Real supplier constraints, minimum order quantities, lead times
3. **Client Intelligence**: Behavioral predictions, overdue detection, profitability analysis
4. **Business Context**: Venezuelan market specifics, currency considerations, regulatory factors

### Planned Production Features
- **Multi-tenant SaaS**: Serve multiple distributors from single deployment
- **Real-time Integrations**: POS systems (Stellar, Odoo, Profit), WhatsApp Business API
- **Advanced Analytics**: ML-powered demand forecasting, inventory optimization
- **Autonomous Actions**: Auto-reordering, transfer optimization, alert escalation

## Development Standards

### Code Style (from CODING-STANDARDS.md)
- **TypeScript**: Strict mode, explicit return types, no `any`
- **React**: Functional components, hooks, TypeScript interfaces
- **Naming**: PascalCase for components, camelCase for functions, kebab-case for files
- **Error Handling**: Custom error types, Result pattern for operations that can fail

### Business Logic Patterns
- **Venezuelan Context**: All mock data reflects real Venezuelan wholesale distribution
- **B2B Professional**: Executive-level aesthetics suitable for board presentations  
- **Proactive vs Reactive**: System demonstrates AI-driven proactive inventory management
- **ROI-Focused**: Every recommendation includes financial impact and reasoning

### Testing Approach (from docs)
- **Unit Tests**: Jest for Node.js, Pytest for Python
- **Integration Tests**: API endpoint testing, database operations
- **E2E Tests**: Playwright for full user journeys
- **Load Tests**: k6 for performance validation

## File Structure Understanding

```
/
├── dashboard-client/           # React demo dashboard (duplicate)
├── fluxionai-dashboard-client/ # React demo dashboard (main)
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── data/mockData.ts   # Venezuelan business mock data
│   │   ├── types/index.ts     # TypeScript definitions
│   │   └── App.tsx           # Main application
│   ├── demo/index.html       # Single-file demo for presentations
│   └── dist/                 # Production build output
├── docs/                     # System documentation
│   ├── ARCHITECTURE.md       # Full system architecture
│   ├── CODING-STANDARDS.md   # Development standards
│   ├── MVPDefinition.md      # Detailed implementation plan
│   └── other planning docs
└── DEVELOPMENT-PLAN.md       # High-level project roadmap
```

## Business Context & Demo Usage

### Target Audience
Venezuelan wholesale distributors with:
- 1 main warehouse + multiple distribution points
- 500-1000 wholesale clients (supermarkets, pharmacies, kiosks)
- $800K-1.2M container imports from international suppliers
- Need for proactive inventory intelligence vs reactive management

### Demo Scenarios
1. **Stockout Crisis**: Savoy Tango critical shortage, multiple clients requesting
2. **Seasonal Opportunity**: Halloween approaching, chocolate demand +280%
3. **Client Risk**: Distribuidora Zulia overdue, relationship at risk
4. **Supply Chain Complexity**: International suppliers, minimum order quantities, lead times
5. **Cash Flow Optimization**: Container timing, payment terms, ROI calculations

### Competitive Advantage
- **Proactive AI**: Alerts before problems occur, not after
- **Business Intelligence**: Deep understanding of Venezuelan market dynamics
- **Executive Level**: Presentations suitable for C-level decision makers
- **ROI-Driven**: Every recommendation quantifies business impact

## Important Implementation Notes

1. **Mock Data Quality**: All data in `mockData.ts` tells a coherent business story with realistic numbers, client names, and product mix
2. **Venezuelan Specificity**: Products, suppliers, and scenarios reflect real Venezuelan wholesale distribution
3. **B2B Professional**: Color scheme, typography, and interactions designed for business environments
4. **Demo-Optimized**: Single-file build for easy client presentations, simulated real-time alerts
5. **Future Architecture**: Current demo designed to showcase vision for full production system

## Next Development Steps

Based on `docs/MVPDefinition.md`, the evolution path is:
1. **Phase 1**: Enhance demo with more interactive features
2. **Phase 2**: Implement core backend services (Node.js API, PostgreSQL)
3. **Phase 3**: Build AI Engine with basic agents (Python FastAPI)
4. **Phase 4**: Add real integrations (POS systems, WhatsApp)
5. **Phase 5**: Multi-tenant production deployment

The extensive documentation in `docs/` provides detailed technical specifications for implementing the full production system.

<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>