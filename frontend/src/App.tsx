import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { LandingPage } from './components/LandingPage';
import Layout from './components/layout/Layout';
import { getTenantId } from './utils/tenant';

// Route-level lazy loading — each module loads only when navigated to
const InventorySummary = lazy(() => import('./components/dashboard/InventorySummary'));
const InventoryDashboard = lazy(() => import('./components/dashboard/InventoryDashboard'));
const SalesSummary = lazy(() => import('./components/sales/SalesSummary'));
const SalesDashboard = lazy(() => import('./components/sales/SalesDashboard'));
const SuggestedOrder = lazy(() => import('./components/orders/SuggestedOrder'));
const OrderWizard = lazy(() => import('./components/orders/OrderWizard'));
const OrderWizardMultiTienda = lazy(() => import('./components/orders/OrderWizardMultiTienda'));
const PedidoInterCediWizard = lazy(() => import('./components/orders/PedidoInterCediWizard'));
const PedidoApprovalView = lazy(() => import('./components/orders/PedidoApprovalView'));
const SalesCoverageCalendar = lazy(() => import('./components/settings/SalesCoverageCalendar'));
const ETLControlCenter = lazy(() => import('./components/settings/ETLControlCenter'));
const ConfiguracionABC = lazy(() => import('./components/admin/ConfiguracionABC'));
const GeneradoresTrafico = lazy(() => import('./components/admin/GeneradoresTrafico'));
const UsuariosAdmin = lazy(() => import('./components/admin/UsuariosAdmin'));
const ExclusionesInterCedi = lazy(() => import('./components/admin/ExclusionesInterCedi'));
const ProductosAdmin = lazy(() => import('./components/admin/ProductosAdmin'));
const ABCXYZAnalysis = lazy(() => import('./components/productos/ABCXYZAnalysis'));
const ABCXYZFullAnalysis = lazy(() => import('./components/productos/ABCXYZFullAnalysis'));
const AnalisisMaestro = lazy(() => import('./components/productos/AnalisisMaestro'));
const ProductosLayout = lazy(() => import('./components/productos/ProductosLayout'));
const EmergenciasDashboard = lazy(() => import('./components/emergencias/EmergenciasDashboard'));
const BusinessIntelligence = lazy(() => import('./components/bi/BusinessIntelligence'));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

// Role-Based Route Protection Component
function RoleProtectedRoute({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const { hasRole } = useAuth();

  if (!hasRole(allowedRoles)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Acceso Denegado
          </h2>
          <p className="text-gray-600 mb-6">
            No tienes permisos para acceder a esta sección del sistema.
          </p>
          <p className="text-sm text-gray-500">
            Si crees que deberías tener acceso, contacta al administrador.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Protected Routes Component
function ProtectedRoutes() {
  const { isAuthenticated, login } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={login} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        {/* Default route: Pedidos Sugeridos (faster load) */}
        <Route index element={<Navigate to="/pedidos-sugeridos" replace />} />
        <Route path="dashboard" element={<Navigate to="/pedidos-sugeridos" replace />} />
        <Route path="inventarios" element={<InventorySummary />} />
        <Route path="dashboard/:ubicacionId" element={<InventoryDashboard />} />
        <Route path="ventas" element={<SalesSummary />} />
        <Route path="ventas/:ubicacionId" element={<SalesDashboard />} />
        {/* Pedidos Sugeridos - Protegido para Gerentes y superiores */}
        <Route
          path="pedidos-sugeridos"
          element={
            <RoleProtectedRoute allowedRoles={['gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin']}>
              <SuggestedOrder />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="pedidos-sugeridos/nuevo"
          element={
            <RoleProtectedRoute allowedRoles={['gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin']}>
              <OrderWizard />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="pedidos-sugeridos/nuevo-multi"
          element={
            <RoleProtectedRoute allowedRoles={['gestor_abastecimiento', 'gerente_general', 'super_admin']}>
              <OrderWizardMultiTienda />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="pedidos-sugeridos/:pedidoId/aprobar"
          element={
            <RoleProtectedRoute allowedRoles={['gerente_tienda', 'gestor_abastecimiento', 'gerente_general', 'super_admin']}>
              <PedidoApprovalView />
            </RoleProtectedRoute>
          }
        />
        {/* Pedidos Inter-CEDI */}
        <Route path="pedidos-inter-cedi/nuevo" element={<PedidoInterCediWizard />} />
        <Route path="pedidos-inter-cedi/:pedidoId" element={<PedidoInterCediWizard />} />
        {/* Emergencias de Inventario */}
        <Route path="emergencias" element={<EmergenciasDashboard />} />

        {/* Business Intelligence - SOLO SUPER ADMIN ⚠️ CRÍTICO */}
        <Route
          path="bi"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <BusinessIntelligence />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="bi/:tab"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <BusinessIntelligence />
            </RoleProtectedRoute>
          }
        />

        {/* Administrador - SOLO SUPER ADMIN ⚠️ CRÍTICO */}
        <Route
          path="administrador"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <ETLControlCenter />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="administrador/ventas/cobertura"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <SalesCoverageCalendar />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="administrador/parametros-abc"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <ConfiguracionABC />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="administrador/generadores-trafico"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <GeneradoresTrafico />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="administrador/usuarios"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <UsuariosAdmin />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="administrador/exclusiones-inter-cedi"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <ExclusionesInterCedi />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="administrador/productos"
          element={
            <RoleProtectedRoute allowedRoles={['super_admin']}>
              <ProductosAdmin />
            </RoleProtectedRoute>
          }
        />
        {/* DEPRECADOS: Redirigir rutas antiguas al nuevo panel */}
        <Route path="administrador/config-inventario" element={<Navigate to="/administrador/parametros-abc" replace />} />
        <Route path="administrador/conjuntos" element={<Navigate to="/administrador/parametros-abc" replace />} />
        <Route path="administrador/alertas" element={<Navigate to="/administrador/parametros-abc" replace />} />
        <Route path="productos" element={<ProductosLayout />}>
          <Route index element={<Navigate to="/productos/analisis-maestro" replace />} />
          <Route path="analisis-maestro" element={<AnalisisMaestro />} />
          <Route path="abc" element={<ABCXYZAnalysis />} />
          <Route path="abc-xyz" element={<ABCXYZFullAnalysis />} />
        </Route>
      </Route>
    </Routes>
  );
}

function App() {
  // Detect if we're on the landing page (no tenant)
  const tenantId = getTenantId();

  // ===================================================================
  // MAINTENANCE WINDOW: DESHABILITADO TEMPORALMENTE PARA DESARROLLO
  // ===================================================================
  // Descomentar el lunes cuando se configure el scheduler nocturno
  // ===================================================================
  /*
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isCheckingMaintenance, setIsCheckingMaintenance] = useState(true);

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

  // Show loading while checking maintenance status
  if (isCheckingMaintenance) {
    return null; // or a loading spinner
  }

  // Show maintenance page if system is in maintenance window
  if (isMaintenanceMode) {
    return <MaintenancePage estimatedEndTime="6:00 AM" />;
  }
  */
  // ===================================================================

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