// =====================================================================================
// FLUXION AI - FRONTEND API SERVICE
// Conexión con AI Engine Backend - APIs de Analytics
// =====================================================================================

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// =====================================================================================
// API CLIENT UTILITIES
// =====================================================================================

class APIClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const config: RequestInit = {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
      };

      console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);
      
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      console.log(`✅ API Response: ${endpoint}`, data);
      
      return {
        success: true,
        data
      };
    } catch (error) {
      console.error(`❌ API Error: ${endpoint}`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async get<T>(endpoint: string): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body: any): Promise<APIResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

// Initialize API client
const apiClient = new APIClient(API_BASE_URL);

// =====================================================================================
// AI ENGINE ANALYTICS INTERFACES
// =====================================================================================

export interface ProductStats {
  productId: string;
  sku: string;
  name: string;
  totalQuantitySold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  salesCount: number;
  storesCount: number;
}

export interface BusinessInsight {
  type: 'insight' | 'warning' | 'opportunity' | 'info';
  title: string;
  description: string;
  businessImpact: string;
  recommendation: string;
  confidence: number;
}

export interface BusinessRecommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'inventory' | 'pricing' | 'marketing' | 'operations';
  title: string;
  description: string;
  action: string;
  expectedImpact: string;
  timeframe: string;
}

export interface TopProductsAnalysis {
  metadata: {
    periodDays: number;
    storeId: string;
    totalProducts: number;
    totalSales: number;
    totalRevenue: number;
    analysisDate: string;
    processingTimeMs: number;
  };
  topProducts: ProductStats[];
  insights: BusinessInsight[];
  recommendations: BusinessRecommendation[];
  summary: string;
}

export interface HourlyPattern {
  hour: number;
  label: string;
  transactions: number;
  revenue: number;
  avgTransactionValue: number;
  topProducts: { name: string; quantity: number }[];
}

export interface DailyPattern {
  dayOfWeek: number;
  dayName: string;
  transactions: number;
  revenue: number;
  avgTransactionValue: number;
  basicProducts: number;
  premiumProducts: number;
  basicVsPremiumRatio: number;
}

export interface WeeklyPattern {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  transactions: number;
  revenue: number;
  avgDailyRevenue: number;
  uniqueProducts: number;
  payrollWeek: boolean;
}

export interface TemporalInsight {
  type: 'insight' | 'warning' | 'opportunity' | 'info';
  category: 'hourly' | 'daily' | 'weekly' | 'general';
  title: string;
  description: string;
  businessImpact: string;
  recommendation: string;
  confidence: number;
  data?: any;
}

export interface TimePatternAnalysis {
  metadata: {
    periodDays: number;
    storeId: string;
    totalTransactions: number;
    dateRange: {
      start: string;
      end: string;
    };
    analysisDate: string;
    processingTimeMs: number;
  };
  hourlyPatterns: HourlyPattern[];
  dailyPatterns: DailyPattern[];
  weeklyPatterns: WeeklyPattern[];
  insights: TemporalInsight[];
  recommendations: BusinessRecommendation[];
  summary: string;
}

export interface RevenueTrendAnalysis {
  summary: {
    currentPeriodRevenue: number;
    previousPeriodRevenue: number;
    changeAmount: number;
    changePercentage: number;
    trendDirection: 'growing' | 'declining' | 'stable';
  };
  trends: {
    byCategory: Array<{
      category: string;
      currentRevenue: number;
      previousRevenue: number;
      changePercentage: number;
      trend: 'growing' | 'declining' | 'stable';
    }>;
    seasonal: Array<{
      pattern: 'quincena' | 'weekend' | 'month-end' | 'holiday';
      description: string;
      impact: 'positive' | 'negative' | 'neutral';
      strength: number;
    }>;
  };
  forecast: {
    next30Days: {
      predictedRevenue: number;
      confidence: number;
      scenario: 'optimistic' | 'realistic' | 'pessimistic';
    };
  };
  insights: Array<{
    type: 'growth_acceleration' | 'declining_trend' | 'seasonal_impact' | 'market_opportunity';
    title: string;
    description: string;
    businessImpact: string;
    recommendation: string;
    confidence: number;
  }>;
  recommendations: BusinessRecommendation[];
  metadata: {
    analysisDate: string;
    periodAnalyzed: string;
    totalDataPoints: number;
    processingTimeMs: number;
  };
}

// =====================================================================================
// AI ENGINE API FUNCTIONS
// =====================================================================================

export const aiEngineAPI = {
  /**
   * Get Top Products Analysis
   */
  async getTopProducts(options: {
    periodDays?: number;
    limit?: number;
    includeComparison?: boolean;
    storeId?: string;
    minSales?: number;
  } = {}): Promise<APIResponse<TopProductsAnalysis>> {
    const queryParams = new URLSearchParams();
    
    if (options.periodDays) queryParams.set('periodDays', options.periodDays.toString());
    if (options.limit) queryParams.set('limit', options.limit.toString());
    if (options.includeComparison) queryParams.set('includeComparison', 'true');
    if (options.storeId) queryParams.set('storeId', options.storeId);
    if (options.minSales) queryParams.set('minSales', options.minSales.toString());

    const endpoint = `/api/analytics/top-products${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return apiClient.get<TopProductsAnalysis>(endpoint);
  },

  /**
   * Get Time Pattern Analysis
   */
  async getTimePatterns(options: {
    periodDays?: number;
    storeId?: string;
    includeHourly?: boolean;
    includeDaily?: boolean;
    includeWeekly?: boolean;
  } = {}): Promise<APIResponse<TimePatternAnalysis>> {
    const queryParams = new URLSearchParams();
    
    if (options.periodDays) queryParams.set('periodDays', options.periodDays.toString());
    if (options.storeId) queryParams.set('storeId', options.storeId);
    if (options.includeHourly) queryParams.set('includeHourly', 'true');
    if (options.includeDaily) queryParams.set('includeDaily', 'true');
    if (options.includeWeekly) queryParams.set('includeWeekly', 'true');

    const endpoint = `/api/analytics/time-patterns${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return apiClient.get<TimePatternAnalysis>(endpoint);
  },

  /**
   * Get Revenue Trends Analysis
   */
  async getRevenueTrends(options: {
    periodDays?: number;
    includeForecasting?: boolean;
    includeSeasonalAnalysis?: boolean;
    forecastDays?: number;
    storeId?: string;
  } = {}): Promise<APIResponse<RevenueTrendAnalysis>> {
    const queryParams = new URLSearchParams();
    
    if (options.periodDays) queryParams.set('periodDays', options.periodDays.toString());
    if (options.includeForecasting) queryParams.set('includeForecasting', 'true');
    if (options.includeSeasonalAnalysis) queryParams.set('includeSeasonalAnalysis', 'true');
    if (options.forecastDays) queryParams.set('forecastDays', options.forecastDays.toString());
    if (options.storeId) queryParams.set('storeId', options.storeId);

    const endpoint = `/api/analytics/revenue-trends${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    return apiClient.get<RevenueTrendAnalysis>(endpoint);
  },

  /**
   * Health Check
   */
  async healthCheck(): Promise<APIResponse<{ status: string; timestamp: string; uptime: number }>> {
    return apiClient.get('/api/health');
  },

  /**
   * Get All Analytics (Combined)
   */
  async getAllAnalytics(options: {
    periodDays?: number;
    storeId?: string;
  } = {}): Promise<{
    topProducts: APIResponse<TopProductsAnalysis>;
    timePatterns: APIResponse<TimePatternAnalysis>;
    revenueTrends: APIResponse<RevenueTrendAnalysis>;
  }> {
    console.log('🔄 Fetching all analytics data...');
    
    const [topProducts, timePatterns, revenueTrends] = await Promise.all([
      this.getTopProducts({ ...options, limit: 10, includeComparison: true }),
      this.getTimePatterns({ ...options, includeHourly: true, includeDaily: true, includeWeekly: true }),
      this.getRevenueTrends({ ...options, includeForecasting: true, includeSeasonalAnalysis: true })
    ]);

    return {
      topProducts,
      timePatterns,
      revenueTrends
    };
  }
};

// =====================================================================================
// EXPORT DEFAULT
// =====================================================================================

export default aiEngineAPI;