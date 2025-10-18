import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import Layout from './components/layout/Layout';
import InventorySummary from './components/dashboard/InventorySummary';
import InventoryDashboard from './components/dashboard/InventoryDashboard';
import SalesSummary from './components/sales/SalesSummary';
import SalesDashboard from './components/sales/SalesDashboard';
import SuggestedOrder from './components/orders/SuggestedOrder';
import OrderWizard from './components/orders/OrderWizard';
import ETLControlCenter from './components/settings/ETLControlCenter';

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
        <Route path="settings/etl" element={<ETLControlCenter />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ProtectedRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;