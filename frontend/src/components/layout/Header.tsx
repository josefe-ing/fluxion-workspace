import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function Header() {
  const location = useLocation();
  const { logout } = useAuth();

  const navItems = [
    { path: '/pedidos-sugeridos', label: 'Pedidos' },
    { path: '/inventarios', label: 'Inventarios' },
    { path: '/ventas', label: 'Ventas' },
    { path: '/productos', label: 'Productos' },
    { path: '/emergencias', label: 'Emergencias' },
    { path: '/bi', label: 'BI' },
  ];

  const isActive = (path: string) => {
    if (path === '/inventarios') {
      return location.pathname === path || location.pathname.startsWith('/inventarios/') || location.pathname.startsWith('/dashboard/');
    }
    if (path === '/ventas') {
      return location.pathname === path || location.pathname.startsWith('/ventas/');
    }
    if (path === '/pedidos-sugeridos') {
      return location.pathname === path || location.pathname.startsWith('/pedidos-sugeridos/');
    }
    if (path === '/productos') {
      return location.pathname === path || location.pathname.startsWith('/productos/');
    }
    if (path === '/emergencias') {
      return location.pathname === path || location.pathname.startsWith('/emergencias/');
    }
    if (path === '/bi') {
      return location.pathname === path || location.pathname.startsWith('/bi/');
    }
    return location.pathname === path;
  };

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link to="/pedidos-sugeridos" className="flex items-center">
              <div className="text-2xl font-bold text-gray-900">
                Fluxion <span className="text-gray-400">IA</span>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.path)
                    ? 'text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* User menu */}
          <div className="flex items-center space-x-4">
            <Link
              to="/administrador"
              className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              Administrador
            </Link>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
