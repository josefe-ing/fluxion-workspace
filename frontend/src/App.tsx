import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { LandingPage } from './components/LandingPage';
import { MaintenancePage } from './components/MaintenancePage';
import Layout from './components/layout/Layout';
import InventorySummary from './components/dashboard/InventorySummary';
import InventoryDashboard from './components/dashboard/InventoryDashboard';
import SalesSummary from './components/sales/SalesSummary';
import SalesDashboard from './components/sales/SalesDashboard';
import SuggestedOrder from './components/orders/SuggestedOrder';
import OrderWizard from './components/orders/OrderWizard';
import PedidoApprovalView from './components/orders/PedidoApprovalView';
import ETLControlCenter from './components/settings/ETLControlCenter';
import { getTenantId } from './utils/tenant';
import { checkMaintenanceStatus } from './services/maintenanceService';

// Protected Routes Component
function ProtectedRoutes() {
  const { isAuthenticated, login } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={login} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<InventorySummary />} />
        <Route path="dashboard/:ubicacionId" element={<InventoryDashboard />} />
        <Route path="ventas" element={<SalesSummary />} />
        <Route path="ventas/:ubicacionId" element={<SalesDashboard />} />
        <Route path="pedidos-sugeridos" element={<SuggestedOrder />} />
        <Route path="pedidos-sugeridos/nuevo" element={<OrderWizard />} />
        <Route path="pedidos-sugeridos/:pedidoId/aprobar" element={<PedidoApprovalView />} />
        <Route path="settings/etl" element={<ETLControlCenter />} />
      </Route>
    </Routes>
  );
}

function App() {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isCheckingMaintenance, setIsCheckingMaintenance] = useState(true);

  // Detect if we're on the landing page (no tenant)
  const tenantId = getTenantId();

  // Check maintenance status on mount and every 2 minutes
  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const status = await checkMaintenanceStatus();
        setIsMaintenanceMode(status.is_maintenance);
      } catch (error) {
        console.error('Error checking maintenance:', error);
        // Si falla la verificación, asumimos que NO está en mantenimiento
        setIsMaintenanceMode(false);
      } finally {
        setIsCheckingMaintenance(false);
      }
    };

    // Check immediately
    checkMaintenance();

    // Check every 2 minutes
    const interval = setInterval(checkMaintenance, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Show landing page for fluxionia.co and www.fluxionia.co
  if (!tenantId) {
    return <LandingPage />;
  }

  // Show loading while checking maintenance status
  if (isCheckingMaintenance) {
    return null; // or a loading spinner
  }

  // Show maintenance page if system is in maintenance window
  if (isMaintenanceMode) {
    return <MaintenancePage estimatedEndTime="6:00 AM" />;
  }

  // Show dashboard for tenant subdomains (granja, admin, etc.)
  return (
    <AuthProvider>
      <BrowserRouter>
        <ProtectedRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;