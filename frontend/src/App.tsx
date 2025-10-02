import { useState, useEffect } from 'react';
import { LayoutDashboard, ShoppingCart, Users, Target, TrendingUp, FileText } from 'lucide-react';
import Header from './components/Header';
import EnhancedKPICards from './components/EnhancedKPICards';
import MainDashboard from './components/MainDashboard';
import PurchaseIntelligence from './components/PurchaseIntelligence';
import ClientIntelligence from './components/ClientIntelligence';
import DailyActionCenter from './components/DailyActionCenter';
import ROITracker from './components/ROITracker';
import OptimizationReports from './components/OptimizationReports';
import EnhancedAIAgentPanel from './components/EnhancedAIAgentPanel';
import ProactiveInsightsPanel from './components/ProactiveInsightsPanel';
import { dashboardViews } from './data/mockData';

function App() {
  const [activeView, setActiveView] = useState<string>('daily-actions');
  const [newAlertsCount, setNewAlertsCount] = useState(0);

  // Simulate real-time alerts for demo
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.8) { // 20% chance every 30 seconds
        setNewAlertsCount(prev => prev + 1);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Target':
        return Target;
      case 'LayoutDashboard':
        return LayoutDashboard;
      case 'ShoppingCart':
        return ShoppingCart;
      case 'Users':
        return Users;
      case 'TrendingUp':
        return TrendingUp;
      case 'FileText':
        return FileText;
      default:
        return LayoutDashboard;
    }
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'daily-actions':
        return <DailyActionCenter />;
      case 'dashboard':
        return <MainDashboard />;
      case 'purchase-intelligence':
        return <PurchaseIntelligence />;
      case 'client-intelligence':
        return <ClientIntelligence />;
      case 'roi-tracker':
        return <ROITracker />;
      case 'optimization-reports':
        return <OptimizationReports />;
      default:
        return <DailyActionCenter />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-gray-200 px-8">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex space-x-8">
            {dashboardViews.map((view) => {
              const IconComponent = getIconComponent(view.icon);
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={`flex items-center px-3 py-4 text-sm font-medium border-b-2 transition-colors duration-200 ${
                    activeView === view.id
                      ? 'border-navy-900 text-navy-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <IconComponent className="w-4 h-4 mr-2" />
                  {view.name}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* KPI Cards - Only show on main dashboard */}
      {activeView === 'dashboard' && (
        <div className="px-8 py-6">
          <div className="max-w-[1600px] mx-auto">
            <EnhancedKPICards />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="px-8 pb-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-12 gap-8">
            {/* Main Content - 60% */}
            <div className="col-span-7">
              {renderActiveView()}
            </div>
            
            {/* AI Panels - 40% */}
            <div className="col-span-5 space-y-6">
              {/* Enhanced AI Agent Panel */}
              <EnhancedAIAgentPanel 
                newAlertsCount={newAlertsCount}
                onClearNewAlerts={() => setNewAlertsCount(0)}
              />
              
              {/* Proactive Insights Panel */}
              <ProactiveInsightsPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;