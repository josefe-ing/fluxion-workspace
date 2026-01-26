import http from './http';

// ============ Types ============

// Impact Types
export interface FluxionImpactSummary {
  capital_liberado: number;
  stock_actual: number;
  stock_baseline: number;
  stock_actual_total?: number;
  stock_baseline_total?: number;
  reduccion_pct: number;
  fill_rate: number;
  tiendas_activas: number;
  tiendas_activas_fluxion?: number;
  dias_promedio_activo: number;
  regiones?: RegionImpact[];
  por_region?: RegionImpact[];
}

export interface RegionImpact {
  region: string;
  capital_liberado: number;
  stock_actual: number;
  stock_baseline?: number;
  reduccion_pct: number;
  tiendas_activas?: number;
  tiendas?: number;
}

export interface StoreImpact {
  ubicacion_id: string;
  nombre: string;
  region: string;
  fecha_activacion: string;
  dias_activo: number;
  stock_baseline: number;
  stock_actual: number;
  capital_liberado: number;
  reduccion_pct: number;
  fill_rate: number;
  rank?: number;
}

// Alias for backward compatibility
export type ImpactSummary = FluxionImpactSummary;

// Store Analysis Types
export interface StoreKPIs {
  ubicacion_id: string;
  nombre: string;
  gmroi: number;
  rotacion_anual: number;
  ventas_30d: number;
  margen_promedio: number;
  stock_valorizado: number;
  fill_rate: number;
  skus_activos: number;
  dias_inventario_promedio?: number;
  vs_promedio_red?: Record<string, number>;
}

export interface StoreProduct {
  producto_id: string;
  nombre: string;
  categoria: string;
  gmroi: number;
  rotacion: number;
  ventas_30d: number;
  margen_pct: number;
  tipo: 'top' | 'bottom';
}

export interface StoreRanking {
  ubicacion_id: string;
  nombre: string;
  region: string;
  valor: number;
  ranking: number;
  rank?: number;
  vs_promedio?: number;
  fill_rate?: number;
}

export interface StoreRankingResponse {
  metric: string;
  promedio: number;
  tiendas: StoreRanking[];
}

// ABC Analysis Types
export interface ABCClasificacion {
  clase: string;
  cantidad_productos: number;
  ventas_total: number;
  tickets_total?: number;
  utilidad_total?: number;
  unidades_vendidas?: number;
  pct_productos: number;
  pct_ventas: number;
  margen_pct?: number;
  venta_promedio_producto?: number;
  unidades_promedio_producto?: number;
}

export interface StoreABCAnalysis {
  ubicacion_id: string;
  clasificaciones: ABCClasificacion[];
}

export interface ABCConsolidatedResponse {
  clasificaciones: ABCClasificacion[];
  categorias_abc: {
    categoria: string;
    clase: string;
    cantidad_productos: number;
    ventas_total: number;
    utilidad_total: number;
    unidades_vendidas: number;
    margen_pct: number;
    venta_promedio_producto: number;
  }[];
  filtro?: {
    tipo: 'global' | 'tienda' | 'region';
    ubicacion_id?: string | null;
    ubicacion_nombre?: string | null;
    region?: string | null;
  };
}

// Product Matrix Types
export interface ProductMatrix {
  productos: ProductMatrixItem[];
  conteo_cuadrantes: Record<string, number>;
  umbrales: {
    gmroi: number;
    rotacion: number;
  };
}

export interface ProductMatrixItem {
  producto_id: string;
  nombre: string;
  categoria: string;
  gmroi: number;
  rotacion: number;
  ventas_30d: number;
  margen_promedio: number;
  cuadrante: 'ESTRELLA' | 'VACA' | 'NICHO' | 'PERRO';
}

export interface ProductStar {
  producto_id: string;
  nombre: string;
  categoria: string;
  gmroi: number;
  rotacion_anual: number;
  ventas_30d: number;
  margen_pct: number;
  stock_valorizado?: number;
}

// Profitability Types
export interface CategoryProfitability {
  categoria: string;
  ventas_30d: number;
  margen_bruto_30d: number;
  margen_pct: number;
  gmroi: number;
  rotacion_anual: number;
  stock_valorizado: number;
}

export interface TopProfitProduct {
  producto_id: string;
  nombre: string;
  categoria: string;
  margen_bruto_30d: number;
  gmroi: number;
  ventas_30d: number;
  margen_pct: number;
}

// Coverage Types
export interface CoverageSummary {
  total_skus: number;
  cobertura_promedio: number;
  skus_baja_cobertura: number;
  skus_media_cobertura: number;
  skus_alta_cobertura: number;
  stock_atrapado_cedi: number;
  oportunidad_estimada: number;
}

export interface LowCoverageProduct {
  producto_id: string;
  nombre: string;
  categoria: string;
  cobertura_pct: number;
  tiendas_con_stock: number;
  total_tiendas: number;
  venta_promedio_tienda: number;
  oportunidad_estimada: number;
}

export interface TrappedStock {
  producto_id: string;
  nombre: string;
  cedi_id: string;
  stock_cedi: number;
  valor_atrapado: number;
  dias_stock: number;
  tiendas_sin_stock: number;
}

export interface StoreGap {
  tienda_id: string;
  tienda_nombre: string;
  producto_id: string;
  producto_nombre: string;
  categoria: string;
  venta_otras_tiendas: number;
  margen_pct: number;
  oportunidad_estimada: number;
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
}

// ============ API Service ============

export const biService = {
  // === Impact Endpoints ===
  async getImpactSummary(): Promise<FluxionImpactSummary> {
    const response = await http.get('/bi/impact/summary');
    return response.data;
  },

  async getImpactByStore(): Promise<StoreImpact[]> {
    const response = await http.get('/bi/impact/by-store');
    return response.data;
  },

  // === Store Analysis Endpoints ===
  async getStoreKPIs(ubicacionId: string): Promise<StoreKPIs> {
    const response = await http.get(`/bi/store/${ubicacionId}/kpis`);
    return response.data;
  },

  async getStoreTopBottomProducts(
    ubicacionId: string,
    limit: number = 10
  ): Promise<{ top: StoreProduct[]; bottom: StoreProduct[] }> {
    const response = await http.get(`/bi/store/${ubicacionId}/top-bottom-products`, {
      params: { limit },
    });
    return response.data;
  },

  async getStoreABCAnalysis(ubicacionId: string): Promise<StoreABCAnalysis> {
    const response = await http.get(`/bi/store/${ubicacionId}/abc-analysis`);
    return response.data;
  },

  async getStoresRanking(
    metric: 'gmroi' | 'ventas' | 'rotacion' | 'stock' = 'gmroi',
    region?: string
  ): Promise<StoreRankingResponse> {
    const response = await http.get('/bi/stores/ranking', {
      params: { metric, region },
    });
    return response.data;
  },

  // === Product Matrix Endpoints ===
  async getProductsABCConsolidated(filters?: { ubicacion_id?: string; region?: string }): Promise<ABCConsolidatedResponse> {
    const response = await http.get('/bi/products/abc-consolidated', {
      params: filters,
    });
    return response.data;
  },

  async getProductsMatrix(filters?: { categoria?: string }): Promise<ProductMatrix> {
    const response = await http.get('/bi/products/matrix', {
      params: filters,
    });
    return response.data;
  },

  async getProductsStars(limit: number = 20): Promise<ProductStar[]> {
    const response = await http.get('/bi/products/stars', {
      params: { limit },
    });
    return response.data;
  },

  async getProductsEliminate(limit: number = 20): Promise<ProductStar[]> {
    const response = await http.get('/bi/products/eliminate', {
      params: { limit },
    });
    return response.data;
  },

  // === Profitability Endpoints ===
  async getProfitabilityByCategory(region?: string): Promise<CategoryProfitability[]> {
    const response = await http.get('/bi/profitability/by-category', {
      params: { region },
    });
    return response.data;
  },

  async getTopProfitProducts(limit: number = 20, region?: string): Promise<TopProfitProduct[]> {
    const response = await http.get('/bi/profitability/top-products', {
      params: { limit, region },
    });
    return response.data;
  },

  // === Coverage Endpoints ===
  async getCoverageSummary(region?: string): Promise<CoverageSummary> {
    const response = await http.get('/bi/coverage/summary', {
      params: { region },
    });
    return response.data;
  },

  async getLowCoverageProducts(limit: number = 20, region?: string): Promise<LowCoverageProduct[]> {
    const response = await http.get('/bi/coverage/low-coverage-products', {
      params: { limit, region },
    });
    return response.data;
  },

  async getTrappedInCedi(limit: number = 20, region?: string): Promise<TrappedStock[]> {
    const response = await http.get('/bi/coverage/trapped-in-cedi', {
      params: { limit, region },
    });
    return response.data;
  },

  async getStoreGaps(limit: number = 20, region?: string): Promise<StoreGap[]> {
    const response = await http.get('/bi/coverage/store-gaps', {
      params: { limit, region },
    });
    return response.data;
  },

  // === Compare Stores Endpoints ===
  async compareStores(storeIds: string[]): Promise<CompareStoresResponse> {
    const response = await http.get('/bi/stores/compare', {
      params: { store_ids: storeIds.join(',') },
    });
    return response.data;
  },

  // === Admin Endpoints ===
  async refreshViews(): Promise<{ success: boolean; message: string }> {
    const response = await http.post('/bi/admin/refresh-views', {});
    return response.data;
  },

  // === New BI Stores Endpoints ===
  async getNetworkKPIs(params: {
    fecha_inicio: string;
    fecha_fin: string;
    comparar_con?: 'anterior' | 'ano_anterior';
    region?: string;
  }): Promise<NetworkKPIsResponse> {
    const response = await http.get('/bi/stores/network/kpis', { params });
    return response.data;
  },

  async getStoreEvolution(params: {
    ubicacion_id: string;
    fecha_inicio: string;
    fecha_fin: string;
  }): Promise<StoreEvolutionResponse> {
    const { ubicacion_id, ...queryParams } = params;
    const response = await http.get(`/bi/stores/${ubicacion_id}/evolution`, {
      params: queryParams,
    });
    return response.data;
  },

  async getHourlyHeatmap(params: {
    ubicacion_id: string;
    dias?: number;
  }): Promise<HourlyHeatmapResponse> {
    const { ubicacion_id, ...queryParams } = params;
    const response = await http.get(`/bi/stores/${ubicacion_id}/hourly-heatmap`, {
      params: queryParams,
    });
    return response.data;
  },

  async getStoreCategories(params: {
    ubicacion_id: string;
    fecha_inicio: string;
    fecha_fin: string;
    top?: number;
  }): Promise<StoreCategoriesResponse> {
    const { ubicacion_id, ...queryParams } = params;
    const response = await http.get(`/bi/stores/${ubicacion_id}/categories`, {
      params: queryParams,
    });
    return response.data;
  },

  async getTicketDistribution(params: {
    ubicacion_id: string;
    fecha_inicio: string;
    fecha_fin: string;
  }): Promise<TicketDistributionResponse> {
    const { ubicacion_id, ...queryParams } = params;
    const response = await http.get(`/bi/stores/${ubicacion_id}/ticket-distribution`, {
      params: queryParams,
    });
    return response.data;
  },

  async compareMultiStores(params: {
    store_ids: string[];
    fecha_inicio: string;
    fecha_fin: string;
  }): Promise<CompareMultiStoresResponse> {
    const response = await http.get('/bi/stores/compare-multi', {
      params: {
        store_ids: params.store_ids.join(','),
        fecha_inicio: params.fecha_inicio,
        fecha_fin: params.fecha_fin,
      },
    });
    return response.data;
  },
};

// Compare Stores Types
export interface CompareStoresResponse {
  tiendas: CompareStoreTienda[];
  resumen: CompareStoresResumen;
  productos_unicos: ProductoUnico[];
  productos_comunes: ProductoComun[];
  productos_parciales: ProductoParcial[];
}

export interface CompareStoreTienda {
  id: string;
  nombre: string;
  region: string;
}

export interface CompareStoresResumen {
  productos_unicos: number;
  productos_comunes: number;
  productos_parciales: number;
  total_productos_analizados: number;
}

export interface ProductoUnico {
  producto_id: string;
  nombre: string;
  categoria: string;
  tienda_id: string;
  tienda_nombre: string;
  ventas_30d: number;
  utilidad_30d: number;
  gmroi: number;
  stock: number;
  unidades_vendidas: number;
}

export interface ProductoComun {
  producto_id: string;
  nombre: string;
  categoria: string;
  ventas_por_tienda: VentaPorTienda[];
  venta_max: number;
  venta_min: number;
  diferencia_pct: number;
}

export interface VentaPorTienda {
  tienda_id: string;
  tienda_nombre: string;
  ventas_30d: number;
  utilidad_30d: number;
  margen_promedio: number;
  gmroi: number;
  rotacion_anual: number;
  stock: number;
  unidades_vendidas: number;
}

export interface ProductoParcial {
  producto_id: string;
  nombre: string;
  categoria: string;
  tiendas_con_venta: string[];
  tiendas_sin_venta: string[];
  num_tiendas_con: number;
  num_tiendas_sin: number;
  venta_promedio_donde_existe: number;
}

// ============ New BI Stores Types ============

// Network KPIs Types
export interface NetworkKPIsResponse {
  periodo_actual: PeriodoMetrics;
  periodo_comparacion: PeriodoMetrics;
  variacion: VariacionMetrics;
  metadata: {
    fecha_inicio: string;
    fecha_fin: string;
    fecha_inicio_comp: string;
    fecha_fin_comp: string;
    comparar_con: 'anterior' | 'ano_anterior';
    region: string | null;
    dias_periodo: number;
  };
}

export interface PeriodoMetrics {
  ventas_total: number;
  tickets: number;
  ticket_promedio: number;
  margen_pct: number;
  items_totales: number;
}

export interface VariacionMetrics {
  ventas_pct: number;
  tickets_pct: number;
  ticket_promedio_pct: number;
  margen_pct: number;
  items_totales_pct: number;
}

// Store Evolution Types
export interface StoreEvolutionResponse {
  tienda: {
    ubicacion_id: string;
    nombre: string;
    region: string;
  };
  evolution: EvolutionDay[];
  promedio_red: EvolutionDayAvg[];
  totales: {
    ventas: number;
    tickets: number;
    ticket_promedio: number;
    margen_pct: number;
  };
  metadata: {
    fecha_inicio: string;
    fecha_fin: string;
    dias_totales: number;
  };
}

export interface EvolutionDay {
  fecha: string;
  ventas: number;
  tickets: number;
  ticket_promedio: number;
  items_vendidos: number;
  margen_pct: number;
}

export interface EvolutionDayAvg {
  fecha: string;
  ventas_promedio: number;
}

// Hourly Heatmap Types
export interface HourlyHeatmapResponse {
  tienda: {
    ubicacion_id: string;
    nombre: string;
  };
  heatmap: HeatmapCell[];
  hora_pico: {
    dia_semana: number;
    dia_nombre: string;
    hora: number;
    ventas: number;
  } | null;
  metadata: {
    dias_analizados: number;
    total_ventas: number;
  };
}

export interface HeatmapCell {
  dia_semana: number;
  dia_nombre: string;
  hora: number;
  ventas: number;
  tickets: number;
  pct_total: number;
}

// Store Categories Types
export interface StoreCategoriesResponse {
  tienda: {
    ubicacion_id: string;
    nombre: string;
  };
  categorias: StoreCategory[];
  totales: {
    ventas_total: number;
    categorias_activas: number;
  };
  metadata: {
    fecha_inicio: string;
    fecha_fin: string;
    top: number;
  };
}

export interface StoreCategory {
  categoria: string;
  ventas_total: number;
  pct_ventas: number;
  margen_pct: number;
  productos_vendidos: number;
  tickets: number;
}

// Ticket Distribution Types
export interface TicketDistributionResponse {
  tienda: {
    ubicacion_id: string;
    nombre: string;
  };
  distribucion: TicketRange[];
  totales: {
    total_tickets: number;
    total_ventas: number;
    ticket_promedio_general: number;
  };
  metadata: {
    fecha_inicio: string;
    fecha_fin: string;
  };
}

export interface TicketRange {
  rango: string;
  rango_min: number;
  rango_max: number | null;
  cantidad_tickets: number;
  pct_tickets: number;
  ventas_total: number;
  pct_ventas: number;
  ticket_promedio: number;
}

// Compare Multi Stores Types
export interface CompareMultiStoresResponse {
  stores: MultiStoreData[];
  comparacion: {
    mejor_ventas: string;
    mejor_margen: string;
    mejor_ticket_promedio: string;
  };
  metadata: {
    fecha_inicio: string;
    fecha_fin: string;
    tiendas_comparadas: number;
  };
}

export interface MultiStoreData {
  ubicacion_id: string;
  nombre: string;
  region: string;
  metrics: {
    ventas_total: number;
    tickets: number;
    ticket_promedio: number;
    items_totales: number;
    items_por_ticket: number;
    margen_pct: number;
    top_categoria: {
      nombre: string;
      ventas: number;
    } | null;
  };
}
