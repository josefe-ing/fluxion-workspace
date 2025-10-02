// =====================================================================================
// FLUXION AI - AI ENGINE REACT HOOK
// Custom hook para manejar datos del AI Engine con loading/error states
// =====================================================================================

import { useState, useEffect, useCallback } from 'react';
import { aiEngineAPI, TopProductsAnalysis, TimePatternAnalysis, RevenueTrendAnalysis } from '../services/api';

interface AIEngineState {
  // Data
  topProducts: TopProductsAnalysis | null;
  timePatterns: TimePatternAnalysis | null;
  revenueTrends: RevenueTrendAnalysis | null;
  
  // Loading states
  isLoading: boolean;
  isLoadingTopProducts: boolean;
  isLoadingTimePatterns: boolean;
  isLoadingRevenueTrends: boolean;
  
  // Error states
  error: string | null;
  topProductsError: string | null;
  timePatternsError: string | null;
  revenueTrendsError: string | null;
  
  // Metadata
  lastUpdated: Date | null;
  isConnected: boolean;
}

interface UseAIEngineOptions {
  periodDays?: number;
  storeId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
}

export const useAIEngine = (options: UseAIEngineOptions = {}) => {
  const {
    periodDays = 30,
    storeId,
    autoRefresh = false,
    refreshInterval = 300000 // 5 minutes
  } = options;

  const [state, setState] = useState<AIEngineState>({
    topProducts: null,
    timePatterns: null,
    revenueTrends: null,
    isLoading: false,
    isLoadingTopProducts: false,
    isLoadingTimePatterns: false,
    isLoadingRevenueTrends: false,
    error: null,
    topProductsError: null,
    timePatternsError: null,
    revenueTrendsError: null,
    lastUpdated: null,
    isConnected: false
  });

  // =====================================================================================
  // INDIVIDUAL DATA FETCHERS
  // =====================================================================================

  const fetchTopProducts = useCallback(async () => {
    setState(prev => ({ ...prev, isLoadingTopProducts: true, topProductsError: null }));
    
    try {
      const response = await aiEngineAPI.getTopProducts({
        periodDays,
        storeId,
        limit: 10,
        includeComparison: true
      });
      
      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          topProducts: response.data!,
          isLoadingTopProducts: false,
          isConnected: true
        }));
        
        console.log('✅ Top Products data updated');
      } else {
        throw new Error(response.error || 'Failed to fetch top products');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isLoadingTopProducts: false,
        topProductsError: errorMessage,
        isConnected: false
      }));
      
      console.error('❌ Top Products fetch failed:', errorMessage);
    }
  }, [periodDays, storeId]);

  const fetchTimePatterns = useCallback(async () => {
    setState(prev => ({ ...prev, isLoadingTimePatterns: true, timePatternsError: null }));
    
    try {
      const response = await aiEngineAPI.getTimePatterns({
        periodDays,
        storeId,
        includeHourly: true,
        includeDaily: true,
        includeWeekly: true
      });
      
      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          timePatterns: response.data!,
          isLoadingTimePatterns: false,
          isConnected: true
        }));
        
        console.log('✅ Time Patterns data updated');
      } else {
        throw new Error(response.error || 'Failed to fetch time patterns');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isLoadingTimePatterns: false,
        timePatternsError: errorMessage,
        isConnected: false
      }));
      
      console.error('❌ Time Patterns fetch failed:', errorMessage);
    }
  }, [periodDays, storeId]);

  const fetchRevenueTrends = useCallback(async () => {
    setState(prev => ({ ...prev, isLoadingRevenueTrends: true, revenueTrendsError: null }));
    
    try {
      const response = await aiEngineAPI.getRevenueTrends({
        periodDays,
        includeForecasting: true,
        includeSeasonalAnalysis: true,
        storeId
      });
      
      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          revenueTrends: response.data!,
          isLoadingRevenueTrends: false,
          isConnected: true
        }));
        
        console.log('✅ Revenue Trends data updated');
      } else {
        throw new Error(response.error || 'Failed to fetch revenue trends');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isLoadingRevenueTrends: false,
        revenueTrendsError: errorMessage,
        isConnected: false
      }));
      
      console.error('❌ Revenue Trends fetch failed:', errorMessage);
    }
  }, [periodDays, storeId]);

  // =====================================================================================
  // COMBINED OPERATIONS
  // =====================================================================================

  const fetchAllData = useCallback(async () => {
    console.log('🔄 Refreshing AI Engine data...');
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Check backend health first
      const healthResponse = await aiEngineAPI.healthCheck();
      
      if (!healthResponse.success) {
        throw new Error('Backend not available: ' + healthResponse.error);
      }
      
      // Fetch all data in parallel
      await Promise.all([
        fetchTopProducts(),
        fetchTimePatterns(),
        fetchRevenueTrends()
      ]);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        lastUpdated: new Date(),
        isConnected: true
      }));
      
      console.log('✅ All AI Engine data refreshed successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh data';
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        isConnected: false
      }));
      
      console.error('❌ Failed to refresh AI Engine data:', errorMessage);
    }
  }, [fetchTopProducts, fetchTimePatterns, fetchRevenueTrends]);

  // =====================================================================================
  // AUTO-REFRESH EFFECT
  // =====================================================================================

  useEffect(() => {
    // Initial data fetch
    fetchAllData();
    
    // Setup auto-refresh if enabled
    if (autoRefresh) {
      console.log(`⏰ Setting up auto-refresh every ${refreshInterval / 1000} seconds`);
      
      const interval = setInterval(() => {
        console.log('🔄 Auto-refresh triggered');
        fetchAllData();
      }, refreshInterval);
      
      return () => {
        console.log('🛑 Clearing auto-refresh interval');
        clearInterval(interval);
      };
    }
  }, [fetchAllData, autoRefresh, refreshInterval]);

  // =====================================================================================
  // DERIVED STATE
  // =====================================================================================

  const isLoadingAny = state.isLoading || state.isLoadingTopProducts || state.isLoadingTimePatterns || state.isLoadingRevenueTrends;
  
  const hasAnyData = !!(state.topProducts || state.timePatterns || state.revenueTrends);
  
  const hasAllData = !!(state.topProducts && state.timePatterns && state.revenueTrends);
  
  const hasAnyError = !!(state.error || state.topProductsError || state.timePatternsError || state.revenueTrendsError);

  // Get combined insights from all analyzers
  const getAllInsights = () => {
    const insights = [];
    
    if (state.topProducts?.insights) {
      insights.push(...state.topProducts.insights.map(insight => ({
        ...insight,
        source: 'top-products' as const,
        timestamp: new Date().toISOString()
      })));
    }
    
    if (state.timePatterns?.insights) {
      insights.push(...state.timePatterns.insights.map(insight => ({
        ...insight,
        source: 'time-patterns' as const,
        timestamp: new Date().toISOString()
      })));
    }
    
    if (state.revenueTrends?.insights) {
      insights.push(...state.revenueTrends.insights.map(insight => ({
        ...insight,
        source: 'revenue-trends' as const,
        timestamp: new Date().toISOString()
      })));
    }
    
    // Sort by confidence (highest first)
    return insights.sort((a, b) => b.confidence - a.confidence);
  };

  // Get combined recommendations from all analyzers
  const getAllRecommendations = () => {
    const recommendations = [];
    
    if (state.topProducts?.recommendations) {
      recommendations.push(...state.topProducts.recommendations.map(rec => ({
        ...rec,
        source: 'top-products' as const
      })));
    }
    
    if (state.timePatterns?.recommendations) {
      recommendations.push(...state.timePatterns.recommendations.map(rec => ({
        ...rec,
        source: 'time-patterns' as const
      })));
    }
    
    if (state.revenueTrends?.recommendations) {
      recommendations.push(...state.revenueTrends.recommendations.map(rec => ({
        ...rec,
        source: 'revenue-trends' as const
      })));
    }
    
    // Sort by priority (high -> medium -> low)
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  };

  // =====================================================================================
  // RETURN INTERFACE
  // =====================================================================================

  return {
    // Raw data
    ...state,
    
    // Derived state
    isLoadingAny,
    hasAnyData,
    hasAllData,
    hasAnyError,
    
    // Combined data
    getAllInsights,
    getAllRecommendations,
    
    // Actions
    refreshAll: fetchAllData,
    refreshTopProducts: fetchTopProducts,
    refreshTimePatterns: fetchTimePatterns,
    refreshRevenueTrends: fetchRevenueTrends,
    
    // Utilities
    getConnectionStatus: () => state.isConnected ? 'connected' : 'disconnected',
    getLastUpdatedTime: () => state.lastUpdated?.toLocaleTimeString('es-VE') || 'Never'
  };
};

export default useAIEngine;