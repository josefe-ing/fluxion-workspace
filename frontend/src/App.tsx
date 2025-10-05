import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import InventorySummary from './components/dashboard/InventorySummary';
import InventoryDashboard from './components/dashboard/InventoryDashboard';
import SalesSummary from './components/sales/SalesSummary';
import SalesDashboard from './components/sales/SalesDashboard';
import SuggestedOrder from './components/orders/SuggestedOrder';
import OrderWizard from './components/orders/OrderWizard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<InventorySummary />} />
          <Route path="dashboard/:ubicacionId" element={<InventoryDashboard />} />
          <Route path="ventas" element={<SalesSummary />} />
          <Route path="ventas/:ubicacionId" element={<SalesDashboard />} />
          <Route path="pedidos-sugeridos" element={<SuggestedOrder />} />
          <Route path="pedidos-sugeridos/nuevo" element={<OrderWizard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;