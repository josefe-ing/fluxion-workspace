/**
 * Tipos para el sistema de Pedidos Multi-Tienda con algoritmo DPD+U
 *
 * Estos tipos corresponden a los modelos Pydantic en:
 * backend/models/pedidos_multitienda.py
 */

// =====================================================================================
// TIPOS PARA SELECCIÓN MULTI-TIENDA
// =====================================================================================

export interface TiendaSeleccionada {
  id: string;
  nombre: string;
  seleccionada: boolean;
  codigo_klk?: string;
  ciudad?: string;
}

export interface CediDisponible {
  id: string;
  nombre: string;
  region: string;
  ciudad?: string;
}

// =====================================================================================
// TIPOS PARA ALGORITMO DPD+U
// =====================================================================================

export interface ConfigDPDU {
  peso_demanda: number;      // 0-1, default 0.60
  peso_urgencia: number;     // 0-1, default 0.40
  dias_minimo_urgencia: number;  // default 0.5
}

export interface AsignacionTienda {
  tienda_id: string;
  tienda_nombre: string;

  // Datos de entrada
  demanda_p75: number;
  stock_actual: number;
  dias_stock: number;
  cantidad_necesaria: number;

  // Cálculos DPD+U
  urgencia: number;
  pct_demanda: number;       // % de demanda vs total
  pct_urgencia: number;      // % de urgencia vs total
  peso_final: number;        // Peso combinado (%)

  // Resultado
  cantidad_asignada_unid: number;
  cantidad_asignada_bultos: number;

  // Indicadores
  deficit_vs_necesidad: number;
  cobertura_dias_resultante: number;
}

export interface ConflictoProducto {
  codigo_producto: string;
  descripcion_producto: string;
  categoria?: string;
  clasificacion_abc?: string;
  unidades_por_bulto: number;

  // Stock CEDI
  stock_cedi_disponible: number;
  stock_cedi_bultos: number;

  // Demanda combinada
  demanda_total_tiendas: number;
  necesidad_total_tiendas: number;

  // Es conflicto?
  es_conflicto: boolean;

  // Distribución DPD+U
  distribucion_dpdu: AsignacionTienda[];

  // Para ajustes manuales
  distribucion_manual?: AsignacionTienda[];
  resolucion_usuario?: 'dpdu' | 'manual';
}

// =====================================================================================
// TIPOS PARA PRODUCTOS Y PEDIDOS
// =====================================================================================

export interface ProductoPedidoSimplificado {
  codigo_producto: string;
  descripcion_producto: string;
  categoria?: string;
  clasificacion_abc?: string;
  cuadrante?: string;

  // Cantidades
  unidades_por_bulto: number;
  cantidad_sugerida_unid: number;
  cantidad_sugerida_bultos: number;

  // Stock
  stock_tienda: number;
  stock_cedi_origen: number;
  stock_en_transito?: number;  // Stock en tránsito

  // Métricas de venta
  prom_p75_unid: number;
  prom_20dias_unid?: number;  // Promedio 20 días
  dias_stock: number;

  // Peso
  peso_kg?: number;

  // Ajustado por conflicto?
  ajustado_por_dpdu: boolean;
  cantidad_original_bultos?: number;

  // Sugerido por el algoritmo?
  es_sugerido?: boolean;
}

export interface PedidoTienda {
  tienda_id: string;
  tienda_nombre: string;
  productos: ProductoPedidoSimplificado[];
  total_productos: number;
  total_bultos: number;
  total_unidades: number;
  productos_ajustados_dpdu: number;
}

// =====================================================================================
// TIPOS PARA REQUEST/RESPONSE DE API
// =====================================================================================

export interface CalcularMultiTiendaRequest {
  cedi_origen: string;
  tiendas_destino: Array<{
    tienda_id: string;
    tienda_nombre: string;
  }>;
  dias_cobertura?: number;  // default 3
  incluir_solo_conflictos?: boolean;
}

export interface CalcularMultiTiendaResponse {
  // Metadata
  cedi_origen: string;
  cedi_origen_nombre: string;
  fecha_calculo: string;
  dias_cobertura: number;

  // Configuración usada
  config_dpdu: ConfigDPDU;

  // Conflictos
  conflictos: ConflictoProducto[];
  total_conflictos: number;

  // Productos sin conflicto
  productos_sin_conflicto: number;

  // Pedidos por tienda
  pedidos_por_tienda: PedidoTienda[];

  // Resumen
  resumen: {
    total_tiendas: number;
    total_productos_unicos: number;
    total_conflictos: number;
    total_bultos: number;
  };
}

// =====================================================================================
// TIPOS PARA GUARDAR PEDIDOS
// =====================================================================================

export interface ProductoPedidoAjustado {
  codigo_producto: string;
  descripcion_producto: string;
  categoria?: string;
  clasificacion_abc?: string;

  unidades_por_bulto: number;
  cantidad_pedida_bultos: number;
  cantidad_pedida_unidades: number;

  stock_tienda: number;
  stock_cedi_origen: number;

  prom_p75_unid: number;
  prom_ventas_5dias_unid?: number;
  prom_ventas_20dias_unid?: number;

  stock_minimo?: number;
  stock_maximo?: number;
  punto_reorden?: number;

  ajustado_por_dpdu: boolean;
  cantidad_original_bultos?: number;
  razon_ajuste_dpdu?: string;

  incluido: boolean;
}

export interface PedidoTiendaParaGuardar {
  tienda_destino_id: string;
  tienda_destino_nombre: string;
  productos: ProductoPedidoAjustado[];
  observaciones?: string;
  devoluciones?: unknown[];
}

export interface GuardarMultiTiendaRequest {
  cedi_origen_id: string;
  cedi_origen_nombre: string;
  pedidos: PedidoTiendaParaGuardar[];
  dias_cobertura?: number;
  fecha_pedido?: string;
  fecha_entrega_solicitada?: string;
  tipo_pedido?: string;
  prioridad?: string;
  requiere_aprobacion?: boolean;
  observaciones_globales?: string;
  usuario_creador?: string;
}

export interface PedidoGuardadoInfo {
  pedido_id: string;
  numero_pedido: string;
  tienda_id: string;
  tienda_nombre: string;
  total_productos: number;
  total_bultos: number;
  estado: string;
}

export interface GuardarMultiTiendaResponse {
  success: boolean;
  grupo_pedido_id: string;
  pedidos_creados: PedidoGuardadoInfo[];
  total_pedidos: number;
  mensaje: string;
}

// =====================================================================================
// TIPOS PARA EL WIZARD MULTI-TIENDA
// =====================================================================================

export interface OrderDataMultiTienda {
  // Paso 1: Origen y destinos
  cedi_origen: string;
  cedi_origen_nombre: string;
  tiendas_seleccionadas: TiendaSeleccionada[];

  // Paso 2: Conflictos (calculados)
  conflictos: ConflictoProducto[];
  config_dpdu: ConfigDPDU;

  // Paso 3: Pedidos por tienda
  pedidos_por_tienda: PedidoTienda[];

  // Metadata
  fecha_pedido: string;
  dias_cobertura: number;
  observaciones_globales: string;
}

export type WizardStep = 1 | 2 | 3 | 4;

export interface WizardStepInfo {
  number: WizardStep;
  name: string;
  description: string;
  enabled: boolean;
}

// =====================================================================================
// TIPOS PARA RESPONSE DE UBICACIONES
// =====================================================================================

export interface TiendasPorCediResponse {
  cedi_id: string;
  region: string;
  total_tiendas: number;
  tiendas: Array<{
    id: string;
    nombre: string;
    codigo_klk?: string;
    ciudad?: string;
    activo: boolean;
  }>;
}

export interface CedisResponse {
  total: number;
  cedis: Array<{
    id: string;
    nombre: string;
    region: string;
    ciudad?: string;
    activo: boolean;
  }>;
}
