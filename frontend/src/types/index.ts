export interface InventoryAlert {
  id: string;
  type: 'critical' | 'opportunity' | 'insight';
  title: string;
  message: string;
  timestamp: string;
  priority: 'high' | 'medium' | 'low';
  actions: string[];
  isNew?: boolean;
  decisionType: 'tactical' | 'strategic';
  timeframe: string; // '0-7 días', '1-3 meses', etc.
  impact: 'immediate' | 'short-term' | 'long-term';
}

export interface Supplier {
  id: string;
  name: string;
  country: 'Venezuela' | 'Colombia' | 'México' | 'USA' | 'China';
  type: 'local' | 'regional' | 'international';
  paymentTerms: string;
  leadTimeDays: number;
  minimumOrder: number;
  currency: 'USD' | 'VES' | 'COP';
  reliability: 'high' | 'medium' | 'low';
  pricePerUnit: number;
  lastOrderDate: string;
  riskFactors: string[];
  strengths: string[];
}

export interface ProductRecommendation {
  sku: string;
  name: string;
  currentStock: number;
  trend: string;
  recommendedOrder: number;
  reasoning: string;
  priority: 'critical' | 'high' | 'medium';
  estimatedCost?: number;
  profitability: {
    marginPercent: number;
    grossProfit: number;
    roi: number;
    contributionMargin: number;
  };
  rotation: {
    daysSinceLastOrder: number;
    averageOrderFrequency: number; // days between orders
    inventoryTurnover: number; // times per year
    velocityScore: 'fast' | 'medium' | 'slow';
  };
  // Supply Chain Reality
  primarySupplier: Supplier; // THE supplier for this product
  minimumOrderQty: number;
  leadTimeDays: number;
  supplyChainConstraints: {
    isMinimumMet: boolean;
    adjustedOrderQty: number;
    totalLeadTime: number;
    supplyRisk: 'low' | 'medium' | 'high';
    alternativeAction?: string;
  };
  // Optional: backup suppliers for contingency
  alternativeSuppliers?: Supplier[];
  supplierAnalysis: {
    primarySupplierName: string;
    leadTimeWarning?: string;
    minimumOrderWarning?: string;
    recommendation: string;
    riskAlert?: string;
  };
}

export interface ClientIntelligence {
  id: string;
  name: string;
  lastOrder: string;
  nextOrderPredicted: string;
  probability: number;
  insight: string;
  status: 'active' | 'overdue' | 'new_pattern';
  monthlyVolume?: number;
  profitability: {
    marginPercent: number;
    grossProfitMonthly: number;
    ltv: number; // lifetime value
    costToServe: number;
    profitabilityScore: 'high' | 'medium' | 'low';
  };
  recurrence: {
    averageDaysBetweenOrders: number;
    orderFrequencyTrend: 'increasing' | 'stable' | 'decreasing';
    consistencyScore: number; // 0-100, how predictable their orders are
    lastOrderDaysAgo: number;
    totalOrders: number;
  };
}

export interface KPIData {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'stable';
  target?: string;
  subtitle?: string;
}

export interface WarehouseData {
  location: string;
  totalValue: number;
  totalSKUs: number;
  occupancyPercent: number;
  topCategories: CategoryData[];
}

export interface CategoryData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

export interface DashboardView {
  id: string;
  name: string;
  icon: string;
  component: string;
}

export interface NotificationAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  action: () => void;
}

export interface User {
  name: string;
  company: string;
  role: string;
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  message: string;
  timestamp: string;
  type?: 'text' | 'suggestion' | 'data' | 'tactical' | 'strategic';
  decisionType?: 'tactical' | 'strategic';
  timeframe?: string;
}

export interface ChatSuggestion {
  id: string;
  text: string;
  category: 'inventory' | 'clients' | 'analytics' | 'forecast';
}

export interface InventoryStatus {
  status: 'available' | 'reserved' | 'in_transit_out' | 'in_transit_in' | 'on_order';
  quantity: number;
  value: number;
  details?: string;
}

export interface ProductInventory {
  sku: string;
  name: string;
  totalQuantity: number;
  totalValue: number;
  statuses: InventoryStatus[];
  category: string;
  lastUpdated: string;
}

export interface InventoryFlow {
  status: 'available' | 'reserved' | 'in_transit_out' | 'in_transit_in' | 'on_order';
  label: string;
  quantity: number;
  value: number;
  percentage: number;
  color: string;
  icon: string;
  description: string;
}

// Configuration Interfaces
export interface SupplierConfiguration {
  id: string;
  name: string;
  contactInfo: {
    email: string;
    phone: string;
    address: string;
  };
  country: string;
  leadTimeDays: number;
  minimumOrder: number;
  paymentTerms: string;
  currency: 'USD' | 'VES' | 'COP';
  reliability: 'high' | 'medium' | 'low';
  isActive: boolean;
  products: string[]; // Array of product SKUs this supplier provides
  createdAt: string;
  updatedAt: string;
}

export interface ProductSupplierMapping {
  productSku: string;
  productName: string;
  primarySupplierId: string;
  alternativeSupplierIds: string[];
  lastUpdated: string;
}

export interface SyncConfiguration {
  frequency: 'hourly' | 'daily' | 'weekly' | 'manual';
  autoSync: boolean;
  syncTime: string; // HH:MM format for scheduled syncs
  dataSources: {
    inventory: boolean;
    sales: boolean;
    suppliers: boolean;
    clients: boolean;
  };
  lastSyncTimestamp?: string;
}

export interface SyncHistoryRecord {
  id: string;
  timestamp: string;
  type: 'manual' | 'scheduled';
  status: 'success' | 'error' | 'partial';
  duration: number; // in milliseconds
  recordsUpdated: {
    inventory: number;
    sales: number;
    suppliers: number;
    clients: number;
  };
  errors?: string[];
  warnings?: string[];
  triggeredBy: string; // user ID or 'system'
  summary: string;
}

export interface ClientConfiguration {
  companyName: string;
  industry: string;
  region: string;
  currency: 'USD' | 'VES' | 'COP';
  timezone: string;
  businessHours: {
    start: string;
    end: string;
    timezone: string;
  };
  preferences: {
    defaultLeadTimeBuffer: number; // days to add to supplier lead times
    lowStockThreshold: number; // percentage
    criticalStockThreshold: number; // percentage
    maxOrderFrequency: number; // days between orders per product
  };
}

// =====================================================================================
// AI ENGINE INTEGRATION TYPES
// =====================================================================================

export interface AIEngineInsight extends InventoryAlert {
  source: 'top-products' | 'time-patterns' | 'revenue-trends';
  confidence: number;
  businessImpact: string;
  recommendation: string;
}

export interface AIEngineRecommendation {
  id: string;
  source: 'top-products' | 'time-patterns' | 'revenue-trends';
  priority: 'high' | 'medium' | 'low';
  category: 'inventory' | 'pricing' | 'marketing' | 'operations';
  title: string;
  description: string;
  action: string;
  expectedImpact: string;
  timeframe: string;
}

export interface AIEngineConnectionStatus {
  isConnected: boolean;
  lastUpdated: Date | null;
  isLoading: boolean;
  hasData: boolean;
  errorMessage?: string;
}

export interface EnhancedKPIData extends KPIData {
  source?: 'ai-engine' | 'mock';
  confidence?: number;
  lastUpdated?: string;
}