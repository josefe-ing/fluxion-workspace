/**
 * Landing Page for fluxionia.co
 * Simple coming soon / under construction page
 */

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 md:p-12 text-center">
        <div className="mb-8">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Fluxion AI
          </h1>
          <p className="text-xl md:text-2xl text-blue-200 mb-2">
            Intelligent Inventory Management
          </p>
          <p className="text-lg text-blue-300">
            Gestión de inventarios con inteligencia artificial proactiva
          </p>
        </div>

        <div className="mb-8 p-6 bg-white/5 rounded-xl border border-white/20">
          <p className="text-white text-lg mb-2">
            🚀 En construcción
          </p>
          <p className="text-blue-200 text-sm">
            Estamos trabajando en algo increíble. Pronto estaremos listos.
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-white/80 text-sm">
            ¿Ya tienes una cuenta?
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://granja.fluxionia.co"
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
            >
              Acceder a La Granja Mercado
            </a>
            <a
              href="https://admin.fluxionia.co"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
            >
              Panel Administrativo
            </a>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/20">
          <p className="text-white/60 text-sm">
            &copy; 2025 Fluxion AI. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
