# Guia de Contribucion

Bienvenido al equipo de Fluxion AI. Esta guia explica como trabajar en el proyecto.

---

## Antes de empezar

1. Lee el [Developer Guide](docs/onboarding/DEVELOPER_GUIDE.md) para entender la arquitectura
2. Configura tu [entorno local](docs/onboarding/DEVELOPER_GUIDE.md#setup-del-entorno-local)
3. Si trabajas en infraestructura, lee el [Architecture & DevOps Guide](docs/onboarding/ARCHITECTURE_DEVOPS.md)

## Workflow de desarrollo

### Branch strategy

Actualmente trabajamos directo en `main` (equipo pequeño). Esto cambiara a medida que el equipo crezca:

```
main ← commits directos (por ahora)
```

Cuando el equipo crezca, adoptaremos:
```
main ← PR desde feature branches
  └── feat/nueva-funcionalidad
  └── fix/correccion-bug
```

### Commits

Usamos **Conventional Commits**:

```bash
# Estructura
<tipo>: <descripcion corta>

# Tipos validos
feat:     # Nueva funcionalidad
fix:      # Correccion de bug
perf:     # Mejora de performance
refactor: # Refactoring sin cambio funcional
docs:     # Solo documentacion
chore:    # Tareas de mantenimiento
test:     # Tests
```

**Ejemplos:**
```bash
feat: Add 3 and 6 month time ranges to sales analysis modal
fix: Resolve critical bugs in multi-store sales modal (wrong product + 4min timeout)
perf: Add 10-minute in-memory cache to summary-regional endpoint
```

### CI/CD

Cada push a `main` dispara automaticamente:

1. Backend: lint + test
2. Frontend: lint + type-check + build
3. Docker build y push a ECR
4. CDK deploy a AWS
5. Frontend deploy a S3 + CloudFront
6. Health check

**Importante:** Verifica que tu codigo compila y pasa lint antes de hacer push.

```bash
# Frontend
cd frontend && npm run type-check && npm run lint

# Backend
cd backend && flake8 . --select=E9,F63,F7,F82
```

---

## Estructura del codigo

### Backend

- **Punto de entrada:** `backend/main.py` (monolitico, ~460KB)
- **Routers:** `backend/routers/` - Un archivo por dominio funcional
- **Servicios:** `backend/services/` - Logica de negocio pesada
- **Base de datos:** `backend/database.py` - Pool de conexiones PostgreSQL

**Agregar un endpoint:**
1. Crear/editar router en `backend/routers/mi_router.py`
2. Registrar en `backend/main.py` con `app.include_router()`
3. Seguir el patron existente de los otros routers

### Frontend

- **Punto de entrada:** `frontend/src/App.tsx`
- **Componentes:** `frontend/src/components/` - Por dominio (orders, productos, bi, etc.)
- **Servicios HTTP:** `frontend/src/services/` - Un archivo por dominio de API
- **Estado global:** `frontend/src/contexts/AuthContext.tsx`

**Agregar un componente:**
1. Crear en la carpeta de dominio correspondiente
2. Usar componentes funcionales con hooks
3. Estilar con TailwindCSS
4. Consumir datos via servicios en `src/services/`

### Base de datos

- **Migraciones:** `database/migrations/NNN_nombre_UP.sql`
- **Se ejecutan automaticamente** al desplegar via `backend/startup.sh`

**Agregar una migracion:**
1. Crear `database/migrations/NNN_nombre_UP.sql`
2. Opcionalmente crear `NNN_nombre_DOWN.sql` para rollback
3. Probar local: `cd database && python3 run_migrations.py`

### ETL

- Ver [ETL Pipeline](docs/onboarding/ETL_PIPELINE.md)
- Configuracion de tiendas: `etl/core/tiendas_config.py`

---

## Convenciones de codigo

### Python (Backend + ETL)

```python
# Type hints en funciones publicas
def calcular_pedido(tienda_id: str, dias: int = 30) -> Dict[str, Any]:
    """Calcula pedido sugerido para una tienda."""
    ...

# Logging (no print)
logger.info(f"Procesando tienda {tienda_id}")
logger.error(f"Error en calculo: {e}", exc_info=True)

# SQL parametrizado (NUNCA f-strings en queries)
cur.execute("SELECT * FROM ventas WHERE ubicacion_id = %s", (tienda_id,))
```

### TypeScript (Frontend)

```typescript
// Interfaces para props
interface PedidoCardProps {
  tiendaId: string;
  productos: Producto[];
  onConfirm: (pedido: Pedido) => void;
}

// Componentes funcionales
const PedidoCard: React.FC<PedidoCardProps> = ({ tiendaId, productos, onConfirm }) => {
  // ...
};

// Async/await para API calls
const fetchPedido = async (tiendaId: string): Promise<Pedido> => {
  const { data } = await api.get(`/pedidos-sugeridos/${tiendaId}`);
  return data;
};
```

### SQL (Migraciones)

```sql
-- Nombre descriptivo del cambio
-- Siempre incluir IF NOT EXISTS cuando sea posible
CREATE TABLE IF NOT EXISTS mi_tabla (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indices con nombre descriptivo
CREATE INDEX IF NOT EXISTS idx_mi_tabla_created_at ON mi_tabla(created_at);
```

---

## Organizacion de archivos

- `archive/` en cualquier carpeta esta **gitignored** - usa para scripts temporales
- Archivos de datos (`.csv`, `.xlsx`) estan **gitignored** - usa PostgreSQL o S3
- Scripts one-off van en `etl/archive/`, no en el root
- Documentacion nueva va en `docs/` con la subcarpeta apropiada

## Variables de entorno

**NUNCA** commitear credenciales reales. Usa:
- `.env` localmente (esta en `.gitignore`)
- AWS Secrets Manager en produccion
- GitHub Secrets para CI/CD

## Contacto

Si tienes dudas sobre el codigo o la arquitectura, revisa primero:
1. [Developer Guide](docs/onboarding/DEVELOPER_GUIDE.md)
2. `CLAUDE.md` en la raiz del proyecto (instrucciones para Claude Code)
3. La documentacion en `docs/`
