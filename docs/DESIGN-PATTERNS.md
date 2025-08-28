# FLUXION AI - PATRONES DE DISEÑO

## FILOSOFÍA ARQUITECTURAL

### Event-Driven Architecture (EDA)
El sistema está diseñado como una arquitectura orientada a eventos donde todos los cambios de estado importantes generan eventos que otros servicios pueden consumir de manera asíncrona.

### Defensive Programming
Cada componente está diseñado para fallar de manera graceful, validar todas las entradas y manejar errores de forma explícita.

### Domain-Driven Design (DDD)
La organización del código refleja el dominio de negocio con bounded contexts claros y un lenguaje ubicuo.

## EVENT-DRIVEN PATTERNS

### 1. Event Bus Pattern
Centraliza la gestión de eventos entre todos los servicios.

```typescript
// shared/events/event.bus.ts
export interface DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly timestamp: Date;
  readonly version: number;
  readonly payload: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  
  constructor(
    private pubSubClient: PubSub,
    private logger: Logger
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    try {
      // Publicar al topic de Google Pub/Sub
      const topicName = `${event.tenantId}.${event.eventType}`;
      const messageId = await this.pubSubClient
        .topic(topicName)
        .publishMessage({
          data: Buffer.from(JSON.stringify(event)),
          attributes: {
            eventType: event.eventType,
            tenantId: event.tenantId,
            aggregateId: event.aggregateId,
          },
        });

      this.logger.info('Event published', {
        eventId: event.eventId,
        eventType: event.eventType,
        messageId,
        tenantId: event.tenantId,
      });

      // También ejecutar handlers locales síncronos
      const localHandlers = this.handlers.get(event.eventType) || [];
      await Promise.all(
        localHandlers.map(handler => 
          handler.handle(event).catch(error => {
            this.logger.error('Local event handler failed', {
              eventType: event.eventType,
              error: error.message,
              handler: handler.constructor.name,
            });
          })
        )
      );
    } catch (error) {
      this.logger.error('Failed to publish event', {
        eventId: event.eventId,
        eventType: event.eventType,
        error: error.message,
      });
      throw error;
    }
  }

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }
}
```

### 2. Event Sourcing Pattern
Almacena todos los cambios como una secuencia de eventos inmutables.

```typescript
// shared/events/event.store.ts
export class EventStore {
  constructor(
    private db: Knex,
    private logger: Logger
  ) {}

  async append(
    streamId: string,
    events: DomainEvent[],
    expectedVersion?: number
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      // Verificar versión esperada para prevenir concurrencia
      if (expectedVersion !== undefined) {
        const currentVersion = await this.getStreamVersion(trx, streamId);
        if (currentVersion !== expectedVersion) {
          throw new ConcurrencyError(
            `Expected version ${expectedVersion}, got ${currentVersion}`
          );
        }
      }

      // Insertar eventos en orden
      for (const event of events) {
        await trx('event_store').insert({
          stream_id: streamId,
          event_id: event.eventId,
          event_type: event.eventType,
          event_data: JSON.stringify(event.payload),
          event_metadata: JSON.stringify(event.metadata || {}),
          version: event.version,
          tenant_id: event.tenantId,
          timestamp: event.timestamp,
        });
      }
    });
  }

  async getEvents(
    streamId: string,
    fromVersion = 0,
    tenantId: string
  ): Promise<DomainEvent[]> {
    const rows = await this.db('event_store')
      .where({
        stream_id: streamId,
        tenant_id: tenantId,
      })
      .where('version', '>=', fromVersion)
      .orderBy('version', 'asc');

    return rows.map(row => ({
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateId: streamId,
      tenantId: row.tenant_id,
      timestamp: row.timestamp,
      version: row.version,
      payload: JSON.parse(row.event_data),
      metadata: JSON.parse(row.event_metadata),
    }));
  }
}
```

### 3. CQRS (Command Query Responsibility Segregation)
Separa las operaciones de lectura y escritura con modelos optimizados para cada uso.

```typescript
// modules/inventory/inventory.commands.ts
export abstract class InventoryCommand {
  abstract readonly tenantId: string;
  abstract readonly aggregateId: string;
  abstract readonly userId: string;
}

export class UpdateStockCommand extends InventoryCommand {
  constructor(
    public readonly tenantId: string,
    public readonly aggregateId: string, // inventoryId
    public readonly userId: string,
    public readonly quantityChange: number,
    public readonly reason: string,
    public readonly metadata?: Record<string, unknown>
  ) {
    super();
  }
}

// modules/inventory/inventory.command-handler.ts
export class InventoryCommandHandler {
  constructor(
    private repository: InventoryRepository,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  async handle(command: UpdateStockCommand): Promise<void> {
    try {
      // Cargar agregado actual
      const inventory = await this.repository.findById(
        command.tenantId,
        command.aggregateId
      );

      if (!inventory) {
        throw new NotFoundError('Inventory item not found');
      }

      // Aplicar lógica de negocio
      const events = inventory.updateStock(
        command.quantityChange,
        command.reason,
        command.userId,
        command.metadata
      );

      // Persistir cambios y eventos
      await this.repository.save(inventory);
      
      // Publicar eventos
      for (const event of events) {
        await this.eventBus.publish(event);
      }

      this.logger.info('Stock updated successfully', {
        tenantId: command.tenantId,
        inventoryId: command.aggregateId,
        quantityChange: command.quantityChange,
        userId: command.userId,
      });
    } catch (error) {
      this.logger.error('Failed to update stock', {
        tenantId: command.tenantId,
        inventoryId: command.aggregateId,
        error: error.message,
      });
      throw error;
    }
  }
}
```

### 4. Saga Pattern
Maneja transacciones distribuidas entre múltiples servicios.

```typescript
// shared/sagas/base.saga.ts
export abstract class BaseSaga {
  protected steps: SagaStep[] = [];
  protected compensations: CompensationAction[] = [];

  abstract execute(): Promise<SagaResult>;

  protected async executeStep<T>(
    step: SagaStep<T>,
    compensationAction: CompensationAction
  ): Promise<T> {
    try {
      const result = await step.execute();
      this.compensations.push(compensationAction);
      return result;
    } catch (error) {
      // Ejecutar compensaciones en orden reverso
      await this.executeCompensations();
      throw error;
    }
  }

  private async executeCompensations(): Promise<void> {
    const reversedCompensations = [...this.compensations].reverse();
    
    for (const compensation of reversedCompensations) {
      try {
        await compensation.execute();
      } catch (error) {
        this.logger.error('Compensation failed', {
          sagaId: this.sagaId,
          compensation: compensation.name,
          error: error.message,
        });
      }
    }
  }
}

// modules/sales/sagas/process-sale.saga.ts
export class ProcessSaleSaga extends BaseSaga {
  constructor(
    private saleData: SaleData,
    private inventoryService: InventoryService,
    private paymentService: PaymentService,
    private logger: Logger
  ) {
    super();
  }

  async execute(): Promise<SagaResult> {
    try {
      // Paso 1: Reservar stock
      const stockReservation = await this.executeStep(
        {
          name: 'ReserveStock',
          execute: () => this.inventoryService.reserveStock(this.saleData.items),
        },
        {
          name: 'ReleaseStock',
          execute: () => this.inventoryService.releaseStock(stockReservation.id),
        }
      );

      // Paso 2: Procesar pago
      const payment = await this.executeStep(
        {
          name: 'ProcessPayment',
          execute: () => this.paymentService.charge(this.saleData.payment),
        },
        {
          name: 'RefundPayment',
          execute: () => this.paymentService.refund(payment.id),
        }
      );

      // Paso 3: Confirmar venta
      const sale = await this.executeStep(
        {
          name: 'CreateSale',
          execute: () => this.saleService.create(this.saleData, payment.id),
        },
        {
          name: 'CancelSale',
          execute: () => this.saleService.cancel(sale.id),
        }
      );

      return { success: true, data: { sale, payment, stockReservation } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

## DOMAIN-DRIVEN DESIGN PATTERNS

### 1. Aggregate Pattern
Encapsula lógica de negocio y mantiene consistencia de datos.

```typescript
// modules/inventory/domain/inventory.aggregate.ts
export class InventoryAggregate {
  private events: DomainEvent[] = [];

  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly storeId: string,
    public readonly productId: string,
    private quantity: number,
    private minStock: number,
    private maxStock: number,
    private unitCost: number,
    private version: number = 0
  ) {}

  updateStock(
    quantityChange: number,
    reason: string,
    userId: string,
    metadata?: Record<string, unknown>
  ): DomainEvent[] {
    // Validaciones de negocio
    const newQuantity = this.quantity + quantityChange;
    if (newQuantity < 0) {
      throw new BusinessRuleViolationError(
        'Stock cannot be negative',
        { currentQuantity: this.quantity, change: quantityChange }
      );
    }

    // Aplicar cambio
    const oldQuantity = this.quantity;
    this.quantity = newQuantity;
    this.version++;

    // Generar evento de stock actualizado
    const stockUpdatedEvent = new StockUpdatedEvent({
      tenantId: this.tenantId,
      aggregateId: this.id,
      storeId: this.storeId,
      productId: this.productId,
      quantityChange,
      quantityBefore: oldQuantity,
      quantityAfter: newQuantity,
      reason,
      userId,
      metadata,
      version: this.version,
    });

    this.events.push(stockUpdatedEvent);

    // Verificar si se debe generar alerta de stock bajo
    if (this.quantity <= this.minStock && oldQuantity > this.minStock) {
      const lowStockEvent = new LowStockAlertEvent({
        tenantId: this.tenantId,
        aggregateId: this.id,
        storeId: this.storeId,
        productId: this.productId,
        currentQuantity: this.quantity,
        minStock: this.minStock,
        severity: this.quantity === 0 ? 'CRITICAL' : 'WARNING',
        version: this.version,
      });

      this.events.push(lowStockEvent);
    }

    return this.getUncommittedEvents();
  }

  getUncommittedEvents(): DomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  static fromHistory(events: DomainEvent[]): InventoryAggregate {
    if (events.length === 0) {
      throw new Error('Cannot create aggregate from empty event history');
    }

    const firstEvent = events[0];
    if (firstEvent.eventType !== 'InventoryCreated') {
      throw new Error('First event must be InventoryCreated');
    }

    const aggregate = new InventoryAggregate(
      firstEvent.aggregateId,
      firstEvent.tenantId,
      firstEvent.payload.storeId as string,
      firstEvent.payload.productId as string,
      firstEvent.payload.initialQuantity as number,
      firstEvent.payload.minStock as number,
      firstEvent.payload.maxStock as number,
      firstEvent.payload.unitCost as number,
      0
    );

    // Aplicar eventos históricos
    events.slice(1).forEach(event => {
      aggregate.applyEvent(event);
    });

    return aggregate;
  }

  private applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case 'StockUpdated':
        this.quantity = event.payload.quantityAfter as number;
        break;
      case 'PricesUpdated':
        this.unitCost = event.payload.newUnitCost as number;
        break;
      // Más eventos...
    }
    this.version = event.version;
  }
}
```

### 2. Repository Pattern
Abstrae el acceso a datos y mantiene la lógica de dominio limpia.

```typescript
// modules/inventory/domain/inventory.repository.interface.ts
export interface IInventoryRepository {
  findById(tenantId: string, id: string): Promise<InventoryAggregate | null>;
  findByStore(tenantId: string, storeId: string): Promise<InventoryAggregate[]>;
  findLowStock(tenantId: string): Promise<InventoryAggregate[]>;
  save(aggregate: InventoryAggregate): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
}

// modules/inventory/infrastructure/inventory.repository.ts
export class InventoryRepository implements IInventoryRepository {
  constructor(
    private db: Knex,
    private eventStore: EventStore,
    private logger: Logger
  ) {}

  async findById(tenantId: string, id: string): Promise<InventoryAggregate | null> {
    try {
      // Cargar desde snapshot si existe
      const snapshot = await this.loadSnapshot(tenantId, id);
      let aggregate: InventoryAggregate | null = null;
      let fromVersion = 0;

      if (snapshot) {
        aggregate = this.hydrateFromSnapshot(snapshot);
        fromVersion = snapshot.version + 1;
      }

      // Cargar eventos desde la última snapshot
      const events = await this.eventStore.getEvents(id, fromVersion, tenantId);
      
      if (aggregate && events.length > 0) {
        // Aplicar eventos sobre snapshot existente
        return InventoryAggregate.fromHistory([
          ...this.createSnapshotEvents(snapshot),
          ...events
        ]);
      } else if (events.length > 0) {
        // Crear desde eventos completos
        return InventoryAggregate.fromHistory(events);
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to load inventory aggregate', {
        tenantId,
        id,
        error: error.message,
      });
      throw new RepositoryError('Failed to load inventory', error);
    }
  }

  async save(aggregate: InventoryAggregate): Promise<void> {
    const events = aggregate.getUncommittedEvents();
    
    if (events.length === 0) {
      return;
    }

    try {
      await this.db.transaction(async (trx) => {
        // Guardar eventos
        await this.eventStore.append(aggregate.id, events);

        // Actualizar proyección de lectura
        await this.updateReadModel(trx, aggregate);

        // Crear snapshot cada N eventos
        if (this.shouldCreateSnapshot(events)) {
          await this.createSnapshot(trx, aggregate);
        }
      });
    } catch (error) {
      this.logger.error('Failed to save inventory aggregate', {
        tenantId: aggregate.tenantId,
        id: aggregate.id,
        eventsCount: events.length,
        error: error.message,
      });
      throw error;
    }
  }

  private async updateReadModel(
    trx: Knex.Transaction,
    aggregate: InventoryAggregate
  ): Promise<void> {
    await trx('inventory_read_model')
      .where({
        id: aggregate.id,
        tenant_id: aggregate.tenantId,
      })
      .update({
        store_id: aggregate.storeId,
        product_id: aggregate.productId,
        quantity: aggregate.quantity,
        min_stock: aggregate.minStock,
        max_stock: aggregate.maxStock,
        unit_cost: aggregate.unitCost,
        updated_at: new Date(),
        version: aggregate.version,
      });
  }
}
```

### 3. Value Object Pattern
Encapsula valores relacionados y sus validaciones.

```typescript
// shared/domain/value-objects/money.ts
export class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: string
  ) {
    if (amount < 0) {
      throw new Error('Money amount cannot be negative');
    }
    if (!this.isValidCurrency(currency)) {
      throw new Error(`Invalid currency: ${currency}`);
    }
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add money with different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error('Factor cannot be negative');
    }
    return new Money(this.amount * factor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  private isValidCurrency(currency: string): boolean {
    return ['USD', 'EUR', 'VES', 'COP', 'BRL'].includes(currency);
  }
}

// modules/inventory/domain/value-objects/stock-level.ts
export class StockLevel {
  constructor(
    public readonly current: number,
    public readonly minimum: number,
    public readonly maximum: number
  ) {
    if (current < 0) {
      throw new Error('Current stock cannot be negative');
    }
    if (minimum < 0) {
      throw new Error('Minimum stock cannot be negative');
    }
    if (maximum < minimum) {
      throw new Error('Maximum stock cannot be less than minimum');
    }
  }

  isLow(): boolean {
    return this.current <= this.minimum;
  }

  isCritical(): boolean {
    return this.current === 0;
  }

  isHigh(): boolean {
    return this.current >= this.maximum;
  }

  canDeduct(quantity: number): boolean {
    return this.current >= quantity;
  }

  afterDeduction(quantity: number): StockLevel {
    if (!this.canDeduct(quantity)) {
      throw new Error('Insufficient stock for deduction');
    }
    return new StockLevel(
      this.current - quantity,
      this.minimum,
      this.maximum
    );
  }

  toString(): string {
    return `${this.current}/${this.minimum}-${this.maximum}`;
  }
}
```

## AI AGENT PATTERNS

### 1. Agent Orchestrator Pattern
Coordina múltiples agentes especializados.

```python
# ai-engine/src/agents/orchestrator.py
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum

class TaskPriority(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4

@dataclass
class AgentTask:
    task_id: str
    agent_type: str
    priority: TaskPriority
    payload: Dict[str, Any]
    tenant_id: str
    created_at: datetime
    deadline: Optional[datetime] = None
    retry_count: int = 0
    max_retries: int = 3

class BaseAgent(ABC):
    def __init__(self, agent_id: str, capabilities: List[str]):
        self.agent_id = agent_id
        self.capabilities = capabilities
        self.is_busy = False
        
    @abstractmethod
    async def process_task(self, task: AgentTask) -> Dict[str, Any]:
        pass
        
    @abstractmethod
    def can_handle(self, task: AgentTask) -> bool:
        pass

class AgentOrchestrator:
    def __init__(self, redis_client: Redis, pubsub_client: PubSubClient):
        self.agents: Dict[str, BaseAgent] = {}
        self.task_queue: List[AgentTask] = []
        self.redis = redis_client
        self.pubsub = pubsub_client
        self.logger = logging.getLogger(__name__)
        
    def register_agent(self, agent: BaseAgent) -> None:
        """Registra un agente en el orchestrator."""
        self.agents[agent.agent_id] = agent
        self.logger.info(f"Agent registered: {agent.agent_id}")
        
    async def submit_task(self, task: AgentTask) -> str:
        """Envía una tarea para ser procesada por el agente apropiado."""
        # Validar que existe un agente capaz de manejar la tarea
        capable_agents = [
            agent for agent in self.agents.values() 
            if agent.can_handle(task) and not agent.is_busy
        ]
        
        if not capable_agents:
            # Agregar a cola si no hay agentes disponibles
            self.task_queue.append(task)
            await self._persist_task(task)
            self.logger.warning(
                f"No available agents for task {task.task_id}. Queued."
            )
            return task.task_id
            
        # Seleccionar el mejor agente disponible
        selected_agent = self._select_best_agent(capable_agents, task)
        
        # Procesar tarea
        try:
            selected_agent.is_busy = True
            result = await selected_agent.process_task(task)
            
            # Publicar resultado
            await self._publish_result(task, result)
            
            # Procesar próxima tarea en cola
            await self._process_next_queued_task()
            
        except Exception as e:
            await self._handle_task_failure(task, selected_agent, e)
        finally:
            selected_agent.is_busy = False
            
        return task.task_id
        
    def _select_best_agent(
        self, 
        agents: List[BaseAgent], 
        task: AgentTask
    ) -> BaseAgent:
        """Selecciona el mejor agente basado en capacidades y carga."""
        # Lógica de selección: priorizar por especialización y carga
        return min(agents, key=lambda a: self._calculate_agent_score(a, task))
        
    def _calculate_agent_score(self, agent: BaseAgent, task: AgentTask) -> float:
        """Calcula score del agente para la tarea (menor es mejor)."""
        base_score = 1.0
        
        # Bonus por especialización
        if task.agent_type in agent.capabilities:
            base_score *= 0.5
            
        # Penalización por carga actual
        current_load = self._get_agent_load(agent.agent_id)
        base_score *= (1 + current_load * 0.1)
        
        return base_score
        
    async def _handle_task_failure(
        self, 
        task: AgentTask, 
        agent: BaseAgent, 
        error: Exception
    ) -> None:
        """Maneja fallos en el procesamiento de tareas."""
        task.retry_count += 1
        
        if task.retry_count <= task.max_retries:
            # Reintenta con backoff exponencial
            delay = 2 ** task.retry_count
            await asyncio.sleep(delay)
            await self.submit_task(task)
        else:
            # Marcar como fallida permanentemente
            await self._publish_failure(task, error)
            
        self.logger.error(
            f"Task {task.task_id} failed on agent {agent.agent_id}: {error}"
        )
```

### 2. Forecast Agent Pattern
Agente especializado en predicciones de demanda.

```python
# ai-engine/src/agents/forecast_agent.py
from prophet import Prophet
import pandas as pd
from typing import Dict, List, Any, Tuple
import numpy as np

class ForecastAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            agent_id="forecast_agent",
            capabilities=["demand_forecast", "trend_analysis", "seasonality_detection"]
        )
        self.models: Dict[str, Prophet] = {}
        
    async def process_task(self, task: AgentTask) -> Dict[str, Any]:
        """Procesa tareas de forecasting."""
        task_type = task.payload.get("type")
        
        if task_type == "demand_forecast":
            return await self._generate_demand_forecast(task)
        elif task_type == "trend_analysis":
            return await self._analyze_trends(task)
        elif task_type == "seasonality_detection":
            return await self._detect_seasonality(task)
        else:
            raise ValueError(f"Unknown forecast task type: {task_type}")
            
    def can_handle(self, task: AgentTask) -> bool:
        return task.agent_type in self.capabilities
        
    async def _generate_demand_forecast(self, task: AgentTask) -> Dict[str, Any]:
        """Genera predicción de demanda usando Prophet."""
        try:
            product_id = task.payload["product_id"]
            store_id = task.payload["store_id"] 
            days_ahead = task.payload.get("days_ahead", 30)
            include_confidence = task.payload.get("include_confidence", True)
            
            # Obtener datos históricos
            historical_data = await self._get_historical_sales_data(
                task.tenant_id, product_id, store_id
            )
            
            if len(historical_data) < 30:  # Mínimo 30 días de datos
                return {
                    "success": False,
                    "error": "Insufficient historical data for forecasting",
                    "min_required_days": 30,
                    "available_days": len(historical_data)
                }
            
            # Preparar datos para Prophet
            df = self._prepare_prophet_data(historical_data)
            
            # Entrenar modelo
            model_key = f"{task.tenant_id}_{product_id}_{store_id}"
            model = self._get_or_create_model(model_key, df)
            
            # Generar predicciones
            future_dates = model.make_future_dataframe(periods=days_ahead)
            forecast = model.predict(future_dates)
            
            # Extraer resultados
            future_forecast = forecast.tail(days_ahead)
            predictions = future_forecast[['ds', 'yhat']].to_dict('records')
            
            result = {
                "success": True,
                "product_id": product_id,
                "store_id": store_id,
                "forecast_days": days_ahead,
                "predictions": [
                    {
                        "date": pred["ds"].isoformat(),
                        "predicted_demand": max(0, round(pred["yhat"])),
                    }
                    for pred in predictions
                ],
                "model_performance": self._calculate_model_performance(model, df),
                "factors_detected": self._identify_forecast_factors(model),
            }
            
            if include_confidence:
                confidence_intervals = future_forecast[['yhat_lower', 'yhat_upper']].values
                for i, prediction in enumerate(result["predictions"]):
                    prediction["confidence_interval"] = {
                        "lower": max(0, round(confidence_intervals[i][0])),
                        "upper": max(0, round(confidence_intervals[i][1])),
                    }
            
            # Cache del modelo entrenado
            await self._cache_model(model_key, model)
            
            return result
            
        except Exception as e:
            self.logger.error(f"Forecast generation failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "task_id": task.task_id
            }
            
    def _prepare_prophet_data(self, sales_data: List[Dict]) -> pd.DataFrame:
        """Prepara datos en formato Prophet (ds, y)."""
        df = pd.DataFrame(sales_data)
        df['ds'] = pd.to_datetime(df['date'])
        df['y'] = df['quantity_sold']
        
        # Agregar regresores externos si están disponibles
        if 'day_of_week' in df.columns:
            df['day_of_week'] = df['day_of_week']
        if 'is_holiday' in df.columns:
            df['is_holiday'] = df['is_holiday'].astype(int)
        if 'promotional_price' in df.columns:
            df['price_discount'] = (
                df['regular_price'] - df['promotional_price']
            ) / df['regular_price']
            
        return df[['ds', 'y'] + [col for col in df.columns 
                                if col not in ['ds', 'y', 'date', 'quantity_sold']]]
                                
    def _get_or_create_model(self, model_key: str, df: pd.DataFrame) -> Prophet:
        """Obtiene modelo existente o crea uno nuevo."""
        if model_key in self.models:
            # Actualizar modelo existente con nuevos datos
            model = self.models[model_key]
            model.fit(df)
        else:
            # Crear nuevo modelo
            model = Prophet(
                daily_seasonality=True,
                weekly_seasonality=True,
                yearly_seasonality=True,
                changepoint_prior_scale=0.05,  # Sensibilidad a cambios de tendencia
                seasonality_prior_scale=10.0,   # Fuerza de estacionalidad
            )
            
            # Agregar regresores externos
            external_regressors = [
                col for col in df.columns 
                if col not in ['ds', 'y']
            ]
            for regressor in external_regressors:
                model.add_regressor(regressor)
                
            # Agregar eventos especiales para Venezuela
            venezuelan_holidays = self._get_venezuelan_holidays()
            model.add_country_holidays(country_name='VE')
            
            model.fit(df)
            self.models[model_key] = model
            
        return model
        
    def _calculate_model_performance(
        self, 
        model: Prophet, 
        df: pd.DataFrame
    ) -> Dict[str, float]:
        """Calcula métricas de performance del modelo."""
        # Cross-validation para evaluar accuracy
        cv_results = cross_validation(
            model, 
            initial='30 days', 
            period='7 days', 
            horizon='7 days'
        )
        
        performance_metrics = performance_metrics(cv_results)
        
        return {
            "mape": float(performance_metrics['mape'].mean()),  # Mean Absolute Percentage Error
            "rmse": float(performance_metrics['rmse'].mean()),  # Root Mean Square Error
            "mae": float(performance_metrics['mae'].mean()),    # Mean Absolute Error
            "coverage": float(performance_metrics['coverage'].mean()), # Prediction interval coverage
        }
        
    def _identify_forecast_factors(self, model: Prophet) -> List[str]:
        """Identifica los factores principales que influyen en el forecast."""
        factors = []
        
        # Analizar componentes del modelo
        if model.yearly_seasonality:
            factors.append("yearly_seasonality")
        if model.weekly_seasonality:
            factors.append("weekly_seasonality")
        if model.daily_seasonality:
            factors.append("daily_seasonality")
            
        # Analizar regresores externos
        if hasattr(model, 'extra_regressors'):
            for regressor in model.extra_regressors:
                factors.append(f"external_{regressor}")
                
        return factors
```

### 3. Alert Agent Pattern
Agente para detección proactiva de anomalías y generación de alertas.

```python
# ai-engine/src/agents/alert_agent.py
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum
import numpy as np
from scipy import stats

class AlertSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

@dataclass
class AlertRule:
    rule_id: str
    name: str
    description: str
    severity: AlertSeverity
    condition: str  # Python expression
    threshold: float
    tenant_id: str
    enabled: bool = True
    
class AlertAgent(BaseAgent):
    def __init__(self, redis_client: Redis):
        super().__init__(
            agent_id="alert_agent",
            capabilities=["anomaly_detection", "threshold_monitoring", "pattern_alerts"]
        )
        self.redis = redis_client
        
    async def process_task(self, task: AgentTask) -> Dict[str, Any]:
        """Procesa tareas de detección de alertas."""
        task_type = task.payload.get("type")
        
        if task_type == "check_thresholds":
            return await self._check_threshold_alerts(task)
        elif task_type == "detect_anomalies":
            return await self._detect_anomalies(task)
        elif task_type == "pattern_analysis":
            return await self._analyze_patterns(task)
        else:
            raise ValueError(f"Unknown alert task type: {task_type}")
            
    async def _check_threshold_alerts(self, task: AgentTask) -> Dict[str, Any]:
        """Verifica alertas basadas en umbrales configurados."""
        tenant_id = task.tenant_id
        alerts_triggered = []
        
        try:
            # Obtener reglas de alertas activas para el tenant
            alert_rules = await self._get_alert_rules(tenant_id)
            
            # Obtener métricas actuales
            current_metrics = await self._get_current_metrics(tenant_id)
            
            for rule in alert_rules:
                if not rule.enabled:
                    continue
                    
                # Evaluar condición de la regla
                if self._evaluate_alert_condition(rule, current_metrics):
                    alert = {
                        "alert_id": f"{rule.rule_id}_{int(time.time())}",
                        "rule_id": rule.rule_id,
                        "rule_name": rule.name,
                        "severity": rule.severity.value,
                        "description": rule.description,
                        "triggered_at": datetime.utcnow().isoformat(),
                        "tenant_id": tenant_id,
                        "metrics": current_metrics,
                        "threshold": rule.threshold,
                    }
                    
                    alerts_triggered.append(alert)
                    
                    # Publicar alerta inmediatamente para casos críticos
                    if rule.severity in [AlertSeverity.ERROR, AlertSeverity.CRITICAL]:
                        await self._publish_immediate_alert(alert)
                        
            return {
                "success": True,
                "alerts_triggered": len(alerts_triggered),
                "alerts": alerts_triggered,
                "tenant_id": tenant_id,
                "checked_at": datetime.utcnow().isoformat(),
            }
            
        except Exception as e:
            self.logger.error(f"Threshold check failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "tenant_id": tenant_id
            }
            
    async def _detect_anomalies(self, task: AgentTask) -> Dict[str, Any]:
        """Detecta anomalías usando análisis estadístico."""
        tenant_id = task.tenant_id
        metric_name = task.payload.get("metric_name")
        lookback_days = task.payload.get("lookback_days", 30)
        
        try:
            # Obtener datos históricos
            historical_data = await self._get_historical_metrics(
                tenant_id, metric_name, lookback_days
            )
            
            if len(historical_data) < 7:  # Mínimo una semana de datos
                return {
                    "success": False,
                    "error": "Insufficient historical data for anomaly detection"
                }
                
            # Análisis estadístico
            values = [point["value"] for point in historical_data]
            anomalies = self._detect_statistical_anomalies(values)
            
            # Análisis de patrones
            pattern_anomalies = self._detect_pattern_anomalies(historical_data)
            
            all_anomalies = anomalies + pattern_anomalies
            
            # Generar alertas para anomalías significativas
            alerts = []
            for anomaly in all_anomalies:
                if anomaly["severity"] >= 0.7:  # Umbral de significancia
                    alert = {
                        "alert_id": f"anomaly_{anomaly['timestamp']}_{int(time.time())}",
                        "type": "anomaly_detected",
                        "severity": self._map_anomaly_severity(anomaly["severity"]),
                        "description": f"Anomalía detectada en {metric_name}",
                        "anomaly": anomaly,
                        "tenant_id": tenant_id,
                        "detected_at": datetime.utcnow().isoformat(),
                    }
                    alerts.append(alert)
                    
            return {
                "success": True,
                "metric_name": metric_name,
                "anomalies_detected": len(all_anomalies),
                "alerts_generated": len(alerts),
                "anomalies": all_anomalies,
                "alerts": alerts,
                "analysis_period": f"{lookback_days} days",
            }
            
        except Exception as e:
            self.logger.error(f"Anomaly detection failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "tenant_id": tenant_id
            }
            
    def _detect_statistical_anomalies(
        self, 
        values: List[float], 
        z_threshold: float = 3.0
    ) -> List[Dict[str, Any]]:
        """Detecta anomalías usando Z-score."""
        if len(values) < 3:
            return []
            
        values_array = np.array(values)
        mean = np.mean(values_array)
        std = np.std(values_array)
        
        if std == 0:  # Sin varianza
            return []
            
        z_scores = np.abs((values_array - mean) / std)
        anomaly_indices = np.where(z_scores > z_threshold)[0]
        
        anomalies = []
        for idx in anomaly_indices:
            anomalies.append({
                "index": int(idx),
                "value": float(values[idx]),
                "z_score": float(z_scores[idx]),
                "severity": min(1.0, float(z_scores[idx] / z_threshold)),
                "type": "statistical",
                "timestamp": idx,  # Se mapea con los datos históricos
            })
            
        return anomalies
        
    def _detect_pattern_anomalies(
        self, 
        historical_data: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Detecta anomalías en patrones temporales."""
        anomalies = []
        
        # Análizar tendencias anómalas
        values = [point["value"] for point in historical_data]
        timestamps = [point["timestamp"] for point in historical_data]
        
        # Detectar cambios abruptos usando diferencias de segundo orden
        if len(values) >= 3:
            second_diffs = np.diff(values, n=2)
            threshold = 2 * np.std(second_diffs) if np.std(second_diffs) > 0 else 1
            
            abrupt_changes = np.where(np.abs(second_diffs) > threshold)[0]
            
            for idx in abrupt_changes:
                real_idx = idx + 2  # Ajuste por las diferencias
                if real_idx < len(values):
                    anomalies.append({
                        "index": int(real_idx),
                        "value": float(values[real_idx]),
                        "change_magnitude": float(abs(second_diffs[idx])),
                        "severity": min(1.0, abs(second_diffs[idx]) / threshold),
                        "type": "abrupt_change",
                        "timestamp": timestamps[real_idx],
                    })
                    
        return anomalies
```

Estos patrones forman la base arquitectural de Fluxion AI, proporcionando una estructura robusta, escalable y mantenible para el sistema de gestión de inventario con IA proactiva.