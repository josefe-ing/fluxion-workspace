import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PasoCediDestinoConfiguracion, { type InterCediOrderConfig } from './wizard-intercedi/PasoCediDestinoConfiguracion';
import PasoSeleccionProductosInterCedi from './wizard-intercedi/PasoSeleccionProductosInterCedi';
import PasoConfirmacionInterCedi from './wizard-intercedi/PasoConfirmacionInterCedi';
import type { ProductoInterCedi, TotalesPorCedi, CalcularPedidoResponse, GuardarPedidoResponse } from '../../services/pedidosInterCediService';
import { calcularPedidoInterCedi, guardarPedidoInterCedi, confirmarPedidoInterCedi, obtenerPedidoInterCedi } from '../../services/pedidosInterCediService';

export default function PedidoInterCediWizard() {
  const navigate = useNavigate();
  const { pedidoId } = useParams<{ pedidoId?: string }>();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modoVisualizacion, setModoVisualizacion] = useState(false);

  // Estado del pedido
  const [config, setConfig] = useState<InterCediOrderConfig>({
    cedi_destino_id: 'cedi_caracas',
    cedi_destino_nombre: 'CEDI Caracas',
    cedi_origen_id: '',
    cedi_origen_nombre: '',
    dias_cobertura_a: 12,
    dias_cobertura_b: 15,
    dias_cobertura_c: 18,
    dias_cobertura_d: 18,
    dias_cobertura_congelados: 7,
    frecuencia_viajes_dias: 'Mar,Jue,Sab',
    lead_time_dias: 2
  });

  const [productos, setProductos] = useState<ProductoInterCedi[]>([]);
  const [totalesPorCedi, setTotalesPorCedi] = useState<Record<string, TotalesPorCedi>>({});
  const [region, setRegion] = useState<string>('');
  const [numTiendasRegion, setNumTiendasRegion] = useState<number>(0);
  const [observaciones, setObservaciones] = useState('');
  const [pedidoGuardadoId, setPedidoGuardadoId] = useState<string | undefined>();
  // Exclusiones aplicadas
  const [totalExcluidos, setTotalExcluidos] = useState<number>(0);
  const [codigosExcluidos, setCodigosExcluidos] = useState<string[]>([]);

  const steps = [
    { number: 1, name: 'Configuración', description: 'CEDI destino y cobertura' },
    { number: 2, name: 'Productos', description: 'Revisar y ajustar' },
    { number: 3, name: 'Confirmación', description: 'Revisar y enviar' },
  ];

  const cargarPedidoExistente = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const pedido = await obtenerPedidoInterCedi(id);

      // Cargar configuración desde el pedido guardado
      // Inferir cedi_origen_id del primer producto si no está en el header
      const cediOrigenId = (pedido as any).cedi_origen_id ||
        pedido.productos?.[0]?.cedi_origen_id || '';
      const cediOrigenNombre = cediOrigenId === 'cedi_frio' ? 'CEDI Frío'
        : cediOrigenId === 'cedi_verde' ? 'CEDI Verde'
        : cediOrigenId === 'cedi_seco' ? 'CEDI Seco' : '';
      setConfig({
        cedi_destino_id: pedido.cedi_destino_id,
        cedi_destino_nombre: pedido.cedi_destino_nombre || 'CEDI Caracas',
        cedi_origen_id: cediOrigenId,
        cedi_origen_nombre: cediOrigenNombre,
        dias_cobertura_a: pedido.dias_cobertura_a,
        dias_cobertura_b: pedido.dias_cobertura_b,
        dias_cobertura_c: pedido.dias_cobertura_c,
        dias_cobertura_d: pedido.dias_cobertura_d,
        dias_cobertura_congelados: pedido.dias_cobertura_congelados ?? 7,
        frecuencia_viajes_dias: pedido.frecuencia_viajes_dias || 'Mar,Jue,Sab',
        lead_time_dias: pedido.lead_time_dias || 2
      });

      // Cargar productos con cantidad_pedida_bultos desde datos guardados
      const productosConPedido = pedido.productos.map(p => ({
        ...p,
        cantidad_pedida_bultos: p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos,
        total_unidades: (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) * p.unidades_por_bulto,
        incluido: (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) > 0
      }));

      setProductos(productosConPedido);
      setRegion(pedido.region || 'CARACAS');
      setObservaciones(pedido.observaciones || '');
      setPedidoGuardadoId(id);
      setModoVisualizacion(pedido.estado !== 'borrador');

      // Calcular totales por CEDI desde los productos
      const totales: Record<string, TotalesPorCedi> = {};
      for (const p of productosConPedido) {
        const cedi = p.cedi_origen_id;
        if (!totales[cedi]) {
          totales[cedi] = { productos: 0, bultos: 0, unidades: 0 };
        }
        totales[cedi].productos++;
        const cant = p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos;
        totales[cedi].bultos += cant;
        totales[cedi].unidades += cant * p.unidades_por_bulto;
      }
      setTotalesPorCedi(totales);

      // Ir directo a Step 2 (productos)
      setCurrentStep(2);

    } catch (err) {
      console.error('Error cargando pedido:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar el pedido');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cargar pedido existente si hay pedidoId en la URL
  useEffect(() => {
    if (pedidoId) {
      cargarPedidoExistente(pedidoId);
    }
  }, [pedidoId, cargarPedidoExistente]);

  // Handlers de navegación
  const handleCancel = () => {
    if (confirm('¿Estás seguro que deseas cancelar? Se perderán los cambios.')) {
      navigate('/pedidos-sugeridos');
    }
  };

  // Paso 1 -> Paso 2: Calcular pedido
  const handleCalcularPedido = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response: CalcularPedidoResponse = await calcularPedidoInterCedi({
        cedi_destino_id: config.cedi_destino_id,
        cedi_origen_id: config.cedi_origen_id,
        dias_cobertura_a: config.dias_cobertura_a,
        dias_cobertura_b: config.dias_cobertura_b,
        dias_cobertura_c: config.dias_cobertura_c,
        dias_cobertura_d: config.dias_cobertura_d,
        dias_cobertura_congelados: config.dias_cobertura_congelados,
        frecuencia_viajes_dias: config.frecuencia_viajes_dias,
        lead_time_dias: config.lead_time_dias
      });

      // Inicializar productos con cantidad_pedida = cantidad_sugerida y incluido = true
      const productosInicializados = response.productos.map(p => ({
        ...p,
        cantidad_pedida_bultos: p.cantidad_sugerida_bultos,
        total_unidades: p.cantidad_sugerida_bultos * p.unidades_por_bulto,
        incluido: p.cantidad_sugerida_bultos > 0
      }));

      setProductos(productosInicializados);
      setTotalesPorCedi(response.totales_por_cedi);
      setRegion(response.region);
      setNumTiendasRegion(response.num_tiendas_region);
      // Guardar info de exclusiones
      setTotalExcluidos(response.total_excluidos_inter_cedi || 0);
      setCodigosExcluidos(response.codigos_excluidos_inter_cedi || []);
      setCurrentStep(2);

    } catch (err) {
      console.error('Error calculando pedido:', err);
      setError(err instanceof Error ? err.message : 'Error al calcular el pedido');
    } finally {
      setIsLoading(false);
    }
  };

  // Guardar como borrador
  const handleGuardarBorrador = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const productosAGuardar = productos.filter(p =>
        p.incluido !== false && (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) > 0
      );

      const response: GuardarPedidoResponse = await guardarPedidoInterCedi({
        cedi_destino_id: config.cedi_destino_id,
        cedi_destino_nombre: config.cedi_destino_nombre,
        dias_cobertura_a: config.dias_cobertura_a,
        dias_cobertura_b: config.dias_cobertura_b,
        dias_cobertura_c: config.dias_cobertura_c,
        dias_cobertura_d: config.dias_cobertura_d,
        dias_cobertura_congelados: config.dias_cobertura_congelados,
        frecuencia_viajes_dias: config.frecuencia_viajes_dias,
        lead_time_dias: config.lead_time_dias,
        observaciones,
        productos: productosAGuardar
      });

      setPedidoGuardadoId(response.id);
      alert(`Pedido ${response.numero_pedido} guardado como borrador exitosamente.`);

    } catch (err) {
      console.error('Error guardando pedido:', err);
      setError(err instanceof Error ? err.message : 'Error al guardar el pedido');
    } finally {
      setIsLoading(false);
    }
  };

  // Confirmar pedido (guardar + confirmar)
  const handleConfirmarPedido = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let idPedido = pedidoGuardadoId;

      // Si no está guardado, guardarlo primero
      if (!idPedido) {
        const productosAGuardar = productos.filter(p =>
          p.incluido !== false && (p.cantidad_pedida_bultos ?? p.cantidad_sugerida_bultos) > 0
        );

        const saveResponse = await guardarPedidoInterCedi({
          cedi_destino_id: config.cedi_destino_id,
          cedi_destino_nombre: config.cedi_destino_nombre,
          dias_cobertura_a: config.dias_cobertura_a,
          dias_cobertura_b: config.dias_cobertura_b,
          dias_cobertura_c: config.dias_cobertura_c,
          dias_cobertura_d: config.dias_cobertura_d,
          dias_cobertura_congelados: config.dias_cobertura_congelados,
          frecuencia_viajes_dias: config.frecuencia_viajes_dias,
          lead_time_dias: config.lead_time_dias,
          observaciones,
          productos: productosAGuardar
        });

        idPedido = saveResponse.id;
        setPedidoGuardadoId(idPedido);
      }

      // Confirmar el pedido
      const confirmResponse = await confirmarPedidoInterCedi(idPedido);

      alert(`Pedido ${confirmResponse.numero_pedido} confirmado exitosamente.`);
      navigate('/pedidos-sugeridos');

    } catch (err) {
      console.error('Error confirmando pedido:', err);
      setError(err instanceof Error ? err.message : 'Error al confirmar el pedido');
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = (data: Partial<InterCediOrderConfig>) => {
    setConfig(prev => ({ ...prev, ...data }));
  };

  return (
    <div className="space-y-4 w-full max-w-none px-2">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Loading overlay for initial load */}
      {isLoading && currentStep === 1 && pedidoId && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-3 text-sm text-gray-600">Cargando pedido...</p>
          </div>
        </div>
      )}

      {/* Breadcrumb / Steps */}
      <nav aria-label="Progress" className="pb-2">
        <ol className="flex items-center justify-center gap-x-8">
          {steps.map((step, stepIdx) => (
            <li key={step.name} className="relative flex items-center">
              <div className="flex items-center gap-x-2">
                {stepIdx !== 0 && (
                  <div className={`h-0.5 w-8 ${currentStep > step.number ? 'bg-gray-900' : 'bg-gray-200'}`}></div>
                )}
                {currentStep > step.number ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900">
                    <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : currentStep === step.number ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900">
                    <span className="text-white font-semibold text-sm">{step.number}</span>
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
                    <span className="text-gray-500 text-sm">{step.number}</span>
                  </div>
                )}
                <div className="text-sm">
                  <div className={`font-medium ${currentStep === step.number ? 'text-gray-900' : 'text-gray-500'}`}>
                    {step.name}
                  </div>
                  <div className="text-xs text-gray-400">{step.description}</div>
                </div>
                {stepIdx !== steps.length - 1 && (
                  <div className={`h-0.5 w-8 ${currentStep > step.number ? 'bg-gray-900' : 'bg-gray-200'}`}></div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="mt-4">
        {currentStep === 1 && (
          <PasoCediDestinoConfiguracion
            config={config}
            updateConfig={updateConfig}
            onNext={handleCalcularPedido}
            onCancel={handleCancel}
            isCalculating={isLoading}
          />
        )}
        {currentStep === 2 && (
          <PasoSeleccionProductosInterCedi
            productos={productos}
            totalesPorCedi={totalesPorCedi}
            region={region}
            numTiendasRegion={numTiendasRegion}
            config={config}
            totalExcluidos={totalExcluidos}
            codigosExcluidos={codigosExcluidos}
            cediOrigenId={config.cedi_origen_id}
            updateProductos={setProductos}
            onNext={() => setCurrentStep(3)}
            onBack={pedidoId ? () => navigate('/pedidos-sugeridos') : () => setCurrentStep(1)}
            readOnly={modoVisualizacion}
          />
        )}
        {currentStep === 3 && (
          <PasoConfirmacionInterCedi
            productos={productos}
            totalesPorCedi={totalesPorCedi}
            config={config}
            region={region}
            numTiendasRegion={numTiendasRegion}
            observaciones={observaciones}
            onObservacionesChange={setObservaciones}
            onBack={() => setCurrentStep(2)}
            onGuardarBorrador={modoVisualizacion ? undefined : handleGuardarBorrador}
            onConfirmar={modoVisualizacion ? undefined : handleConfirmarPedido}
            isLoading={isLoading}
            pedidoGuardadoId={pedidoGuardadoId}
          />
        )}
      </div>
    </div>
  );
}
