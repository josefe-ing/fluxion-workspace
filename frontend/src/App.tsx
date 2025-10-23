import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { LandingPage } from './components/LandingPage';
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
  // Detect if we're on the landing page (no tenant)
  const tenantId = getTenantId();

  // Show landing page for fluxionia.co and www.fluxionia.co
  if (!tenantId) {
    return <LandingPage />;
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