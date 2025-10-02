// =====================================================================================
// FLUXION AI - DEMO API SERVER
// Simple Express server for testing the dashboard with proactive insights
// =====================================================================================

const express = require('express');
const app = express();

app.use(express.json());

// Enable CORS for frontend connection
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Store insights and SSE connections
let insights = [];
let sseConnections = new Set();

// Generate sample insight
const generateSampleInsight = (eventType) => {
  const sampleInsights = {
    'inventory-sync': {
      id: `insight_${Date.now()}`,
      triggeredBy: 'inventory.sync.completed',
      timestamp: new Date().toISOString(),
      type: 'insight',
      priority: 'high',
      title: 'Inventario sincronizado exitosamente',
      description: 'Se actualizó el stock de 156 productos. Detectamos incrementos significativos en productos básicos.',
      recommendation: 'Considerar aumentar pedidos de Harina P.A.N. y Leche Santa Bárbara basado en nuevos niveles de stock.',
      businessImpact: 'Stock optimizado puede prevenir pérdidas por faltantes durante próxima quincena.',
      confidence: 0.89,
      channels: ['dashboard', 'whatsapp'],
      status: 'generated',
      data: {
        syncedProducts: 156,
        newStock: [
          { sku: 'HARINA-PAN-1KG', oldStock: 12, newStock: 48 },
          { sku: 'LECHE-SANTA-1L', oldStock: 8, newStock: 24 }
        ]
      }
    },
    'sales-spike': {
      id: `insight_${Date.now()}`,
      triggeredBy: 'sales.spike.detected',
      timestamp: new Date().toISOString(),
      type: 'opportunity',
      priority: 'critical',
      title: 'Pico de ventas detectado - 165% sobre promedio',
      description: 'Las ventas actuales (Bs 850.50/hora) superan el promedio histórico en 165%. Mayor demanda en productos básicos.',
      recommendation: 'Activar protocolo de restock urgente para Harina P.A.N. y Arroz Diana. Notificar a proveedores clave.',
      businessImpact: 'Oportunidad de capitalizar alta demanda. Riesgo de stockout si no se reacciona rápido.',
      confidence: 0.94,
      channels: ['dashboard', 'whatsapp', 'email'],
      status: 'generated',
      data: {
        currentHourSales: 850.50,
        averageHourSales: 320.00,
        increasePercent: 165.8
      }
    }
  };
  
  return sampleInsights[eventType] || sampleInsights['inventory-sync'];
};

// Broadcast to SSE connections
const broadcastInsight = (insight) => {
  const message = {
    type: 'insight',
    data: insight,
    timestamp: new Date().toISOString()
  };
  
  const data = `data: ${JSON.stringify(message)}\n\n`;
  
  sseConnections.forEach(connection => {
    try {
      connection.write(data);
    } catch (error) {
      console.error('Error broadcasting to SSE connection:', error);
      sseConnections.delete(connection);
    }
  });
  
  console.log(`📡 Broadcasted insight to ${sseConnections.size} SSE connections`);
};

// =====================================================================================
// API ENDPOINTS
// =====================================================================================

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /api/analytics/top-products
 */
app.get('/api/analytics/top-products', (req, res) => {
  const mockAnalysis = {
    metadata: {
      periodDays: 30,
      storeId: 'all',
      totalProducts: 5,
      totalSales: 15,
      totalRevenue: 320.00,
      analysisDate: new Date().toISOString(),
      processingTimeMs: 45
    },
    topProducts: [
      {
        productId: 'p1',
        sku: 'HARINA-PAN-1KG',
        name: 'Harina P.A.N. Blanca 1kg',
        totalQuantitySold: 7,
        totalRevenue: 59.50,
        totalCost: 42.00,
        grossProfit: 17.50,
        profitMargin: 29.41,
        salesCount: 3,
        storesCount: 2
      },
      {
        productId: 'p2',
        sku: 'LECHE-SANTA-1L',
        name: 'Leche Santa Bárbara Completa 1L',
        totalQuantitySold: 6,
        totalRevenue: 72.00,
        totalCost: 54.00,
        grossProfit: 18.00,
        profitMargin: 25.00,
        salesCount: 2,
        storesCount: 1
      }
    ],
    insights: [
      {
        type: 'insight',
        title: 'Harina P.A.N. es tu producto estrella',
        description: 'Las ventas de Harina P.A.N. representan el mayor volumen con excelente rotación.',
        businessImpact: 'Producto básico con demanda constante en el mercado venezolano',
        recommendation: 'Mantener stock suficiente, especialmente en quincenas',
        confidence: 0.95
      }
    ],
    recommendations: [
      {
        priority: 'high',
        category: 'inventory',
        title: 'Optimizar stock de Harina P.A.N.',
        description: 'Aumentar inventario de harina para evitar faltantes durante picos de demanda',
        action: 'Incrementar pedido base de Harina P.A.N. en 25%',
        expectedImpact: 'Reducir pérdidas por faltantes en 15-20%',
        timeframe: '1-2 semanas'
      }
    ],
    summary: 'Análisis de productos top muestra dominio de productos básicos venezolanos.'
  };

  res.json(mockAnalysis);
});

/**
 * GET /api/analytics/time-patterns
 */
app.get('/api/analytics/time-patterns', (req, res) => {
  const mockAnalysis = {
    metadata: {
      periodDays: 30,
      storeId: 'all',
      totalTransactions: 12,
      dateRange: {
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-31T23:59:59.999Z'
      },
      analysisDate: new Date().toISOString(),
      processingTimeMs: 67
    },
    hourlyPatterns: [
      {
        hour: 8,
        label: '8:00 AM',
        transactions: 2,
        revenue: 70.50,
        avgTransactionValue: 35.25,
        topProducts: [
          { name: 'Harina P.A.N. Blanca 1kg', quantity: 4 },
          { name: 'Leche Santa Bárbara Completa 1L', quantity: 3 }
        ]
      }
    ],
    dailyPatterns: [
      {
        dayOfWeek: 1,
        dayName: 'Lunes',
        transactions: 3,
        revenue: 95.50,
        avgTransactionValue: 31.83,
        basicProducts: 2,
        premiumProducts: 1,
        basicVsPremiumRatio: 2.0
      }
    ],
    weeklyPatterns: [
      {
        weekStart: '2024-01-15',
        weekEnd: '2024-01-21',
        weekLabel: 'Semana Quincena',
        transactions: 8,
        revenue: 234.00,
        avgDailyRevenue: 33.43,
        uniqueProducts: 4,
        payrollWeek: true
      }
    ],
    insights: [
      {
        type: 'insight',
        category: 'hourly',
        title: 'Pico matutino de ventas',
        description: 'Las 8:00 AM muestran alta actividad con productos básicos',
        businessImpact: 'Optimización de horarios de staff y stock',
        recommendation: 'Asegurar inventario completo antes de las 8 AM',
        confidence: 0.87
      }
    ],
    recommendations: [
      {
        priority: 'medium',
        category: 'operations',
        title: 'Optimizar horarios de apertura',
        description: 'Considerar abrir más temprano para captar demanda matutina',
        action: 'Evaluar abrir a las 7:30 AM en días laborales',
        expectedImpact: 'Incremento del 10-15% en ventas matutinas',
        timeframe: '2-4 semanas'
      }
    ],
    summary: 'Patrones temporales muestran picos matutinos y efecto quincena claro.'
  };

  res.json(mockAnalysis);
});

/**
 * GET /api/analytics/revenue-trends
 */
app.get('/api/analytics/revenue-trends', (req, res) => {
  const mockAnalysis = {
    summary: {
      currentPeriodRevenue: 320.00,
      previousPeriodRevenue: 275.50,
      changeAmount: 44.50,
      changePercentage: 16.15,
      trendDirection: 'growing'
    },
    trends: {
      byCategory: [
        {
          category: 'Productos Básicos',
          currentRevenue: 187.50,
          previousRevenue: 165.00,
          changePercentage: 13.64,
          trend: 'growing'
        }
      ],
      seasonal: [
        {
          pattern: 'quincena',
          description: 'Picos de ventas en quincenas (días 15 y 30)',
          impact: 'positive',
          strength: 0.85
        }
      ]
    },
    forecast: {
      next30Days: {
        predictedRevenue: 368.00,
        confidence: 0.82,
        scenario: 'optimistic'
      }
    },
    insights: [
      {
        type: 'growth_acceleration',
        title: 'Crecimiento sostenido en productos básicos',
        description: 'Los productos esenciales muestran crecimiento consistente del 16%',
        businessImpact: 'Tendencia positiva que indica buena posición de mercado',
        recommendation: 'Mantener estrategia actual y considerar expansión de categorías',
        confidence: 0.89
      }
    ],
    recommendations: [
      {
        priority: 'high',
        category: 'marketing',
        title: 'Capitalizar tendencia de crecimiento',
        description: 'Aprovechar momentum positivo para introducir nuevas líneas',
        action: 'Evaluar productos complementarios de alta rotación',
        expectedImpact: 'Incremento adicional del 8-12% en ingresos',
        timeframe: '4-6 semanas'
      }
    ],
    metadata: {
      analysisDate: new Date().toISOString(),
      periodAnalyzed: '30 días',
      totalDataPoints: 15,
      processingTimeMs: 89
    }
  };

  res.json(mockAnalysis);
});

/**
 * GET /api/insights/recent
 */
app.get('/api/insights/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  res.json({
    success: true,
    data: {
      insights: insights.slice(0, limit),
      total: insights.length,
      metadata: {
        lastUpdate: new Date().toISOString(),
        filters: { limit }
      }
    }
  });
});

/**
 * GET /api/insights/stats
 */
app.get('/api/insights/stats', (req, res) => {
  const stats = {
    total: insights.length,
    byPriority: {
      critical: insights.filter(i => i.priority === 'critical').length,
      high: insights.filter(i => i.priority === 'high').length,
      medium: insights.filter(i => i.priority === 'medium').length,
      low: insights.filter(i => i.priority === 'low').length
    },
    averageConfidence: insights.reduce((sum, i) => sum + i.confidence, 0) / (insights.length || 1),
    mostRecentUpdate: insights.length > 0 ? insights[0].timestamp : null
  };
  
  res.json({
    success: true,
    data: stats
  });
});

/**
 * GET /api/insights/stream
 */
app.get('/api/insights/stream', (req, res) => {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connection',
    message: 'Connected to Fluxion AI Insights Stream',
    timestamp: new Date().toISOString()
  })}\n\n`);
  
  // Add connection to active SSE connections
  sseConnections.add(res);
  console.log(`📡 New SSE connection. Total connections: ${sseConnections.size}`);
  
  // Handle client disconnect
  req.on('close', () => {
    sseConnections.delete(res);
    console.log(`📡 SSE connection closed. Total connections: ${sseConnections.size}`);
  });
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/**
 * GET /api/insights/demo/inventory-sync
 */
app.get('/api/insights/demo/inventory-sync', (req, res) => {
  console.log('🔄 Demo: Triggering inventory sync event...');
  
  const insight = generateSampleInsight('inventory-sync');
  insights.unshift(insight); // Add to beginning
  
  // Broadcast to SSE connections
  broadcastInsight(insight);
  
  res.json({
    success: true,
    message: 'Inventory sync demo triggered successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/insights/demo/sales-spike
 */
app.get('/api/insights/demo/sales-spike', (req, res) => {
  console.log('📈 Demo: Triggering sales spike event...');
  
  const insight = generateSampleInsight('sales-spike');
  insights.unshift(insight); // Add to beginning
  
  // Broadcast to SSE connections
  broadcastInsight(insight);
  
  res.json({
    success: true,
    message: 'Sales spike demo triggered successfully',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /
 */
app.get('/', (req, res) => {
  res.json({
    name: '🤖 Fluxion AI Demo API Server',
    version: '1.0.0',
    description: 'Servidor de API demo para dashboard con insights proactivos',
    endpoints: {
      health: 'GET /api/health',
      topProducts: 'GET /api/analytics/top-products',
      timePatterns: 'GET /api/analytics/time-patterns',
      revenueTrends: 'GET /api/analytics/revenue-trends',
      insights: 'GET /api/insights/recent',
      insightsStats: 'GET /api/insights/stats',
      insightsStream: 'GET /api/insights/stream',
      demoInventory: 'GET /api/insights/demo/inventory-sync',
      demoSales: 'GET /api/insights/demo/sales-spike'
    },
    features: [
      'API endpoints for AI Engine data',
      'Proactive insights with real-time updates',
      'Server-Sent Events for live streaming',
      'Venezuelan business context',
      'Demo triggers for testing'
    ]
  });
});

// Start server
const PORT = process.env.BACKEND_PORT || 3001;
app.listen(PORT, () => {
  console.log('🚀 Fluxion AI Demo API Server running on port', PORT);
  console.log('🏥 Health check: http://localhost:' + PORT + '/api/health');
  console.log('📊 Analytics: http://localhost:' + PORT + '/api/analytics/*');
  console.log('💡 Insights: http://localhost:' + PORT + '/api/insights/*');
  console.log('📡 SSE Stream: http://localhost:' + PORT + '/api/insights/stream');
});