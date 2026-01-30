/**
 * Wizard Multi-Tienda: Pedidos simultáneos a múltiples tiendas
 *
 * Flujo condicional:
 * - Paso 1: Seleccionar CEDI origen + tiendas destino (checkboxes)
 * - Paso 2: Resolver Conflictos DPD+U (SOLO si hay conflictos Y >1 tienda)
 * - Paso 3: Revisar Pedidos por Tienda (tabs)
 * - Paso 4: Confirmación Consolidada
 *
 * Si solo se selecciona 1 tienda → redirige al flujo normal (OrderWizard)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StepOneMultiSelect from './multi-tienda/StepOneMultiSelect';
import StepTwoConflictResolution from './multi-tienda/StepTwoConflictResolution';
import StepThreeReviewTabs from './multi-tienda/StepThreeReviewTabs';
import StepFourConfirmation from './multi-tienda/StepFourConfirmation';
import type {
  OrderDataMultiTienda,
  CalcularMultiTiendaResponse,
  WizardStepInfo,
  ConfigDPDU,
} from '../../types/multitienda';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

// Estado inicial del wizard
const initialOrderData: OrderDataMultiTienda = {
  cedi_origen: '',
  cedi_origen_nombre: '',
  tiendas_seleccionadas: [],
  incluir_cedi_caracas: false,
  conflictos: [],
  config_dpdu: {
    peso_demanda: 0.60,
    peso_urgencia: 0.40,
    dias_minimo_urgencia: 0.5,
  },
  pedidos_por_tienda: [],
  fecha_pedido: new Date().toISOString().split('T')[0],
  dias_cobertura: 3,
  observaciones_globales: '',
};

export default function OrderWizardMultiTienda() {
  const navigate = useNavigate();

  // Estado principal
  const [orderData, setOrderData] = useState<OrderDataMultiTienda>(initialOrderData);
  const [currentStep, setCurrentStep] = useState(1);

  // Estado de carga y cálculo
  const [calculating, setCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState<CalcularMultiTiendaResponse | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Determinar si hay conflictos (para mostrar/ocultar paso 2)
  const hasConflicts = calculationResult?.total_conflictos && calculationResult.total_conflictos > 0;
  const totalDestinos = orderData.tiendas_seleccionadas.filter(t => t.seleccionada).length + (orderData.incluir_cedi_caracas ? 1 : 0);
  const multipleStores = totalDestinos > 1;
  const showConflictStep = hasConflicts && multipleStores;

  // Pasos dinámicos basados en si hay conflictos
  const getSteps = (): WizardStepInfo[] => {
    const baseSteps: WizardStepInfo[] = [
      {
        number: 1,
        name: 'Origen y Destinos',
        description: 'Seleccionar CEDI y tiendas',
        enabled: true,
      },
    ];

    if (showConflictStep) {
      baseSteps.push({
        number: 2,
        name: 'Resolver Conflictos',
        description: 'Distribuir stock limitado',
        enabled: true,
      });
      baseSteps.push({
        number: 3,
        name: 'Revisar Pedidos',
        description: 'Ajustar por tienda',
        enabled: true,
      });
      baseSteps.push({
        number: 4,
        name: 'Confirmación',
        description: 'Crear pedidos',
        enabled: true,
      });
    } else {
      baseSteps.push({
        number: 2,
        name: 'Revisar Pedidos',
        description: 'Ajustar por tienda',
        enabled: true,
      });
      baseSteps.push({
        number: 3,
        name: 'Confirmación',
        description: 'Crear pedidos',
        enabled: true,
      });
    }

    return baseSteps;
  };

  const steps = getSteps();
  const totalSteps = steps.length;

  // Mapeo de paso visual a paso lógico
  const getLogicalStep = (visualStep: number): 'select' | 'conflicts' | 'review' | 'confirm' => {
    if (visualStep === 1) return 'select';

    if (showConflictStep) {
      if (visualStep === 2) return 'conflicts';
      if (visualStep === 3) return 'review';
      if (visualStep === 4) return 'confirm';
    } else {
      if (visualStep === 2) return 'review';
      if (visualStep === 3) return 'confirm';
    }

    return 'select';
  };

  // Cargar configuración DPD+U al montar
  useEffect(() => {
    cargarConfigDPDU();
  }, []);

  const cargarConfigDPDU = async () => {
    try {
      const response = await fetch(`${API_URL}/api/pedidos-multitienda/config-dpdu`);
      if (response.ok) {
        const config: ConfigDPDU = await response.json();
        setOrderData(prev => ({ ...prev, config_dpdu: config }));
      }
    } catch (err) {
      console.error('Error cargando config DPD+U:', err);
      // Usar valores por defecto si falla
    }
  };

  // Calcular pedidos multi-tienda
  const calcularPedidos = async () => {
    const tiendasActivas = orderData.tiendas_seleccionadas.filter(t => t.seleccionada);

    if (!orderData.cedi_origen || tiendasActivas.length === 0) {
      setCalculationError('Debe seleccionar CEDI y al menos una tienda');
      return;
    }

    setCalculating(true);
    setCalculationError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout

      const response = await fetch(`${API_URL}/api/pedidos-multitienda/calcular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cedi_origen: orderData.cedi_origen,
          tiendas_destino: tiendasActivas.map(t => ({
            tienda_id: t.id,
            tienda_nombre: t.nombre,
          })),
          dias_cobertura: orderData.dias_cobertura,
          incluir_cedi_caracas: orderData.incluir_cedi_caracas || false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error calculando pedidos');
      }

      const result: CalcularMultiTiendaResponse = await response.json();
      setCalculationResult(result);

      // Actualizar orderData con los resultados
      setOrderData(prev => ({
        ...prev,
        conflictos: result.conflictos,
        pedidos_por_tienda: result.pedidos_por_tienda,
        config_dpdu: result.config_dpdu,
      }));

      // Avanzar al siguiente paso
      setCurrentStep(2);
    } catch (err) {
      console.error('Error calculando pedidos:', err);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setCalculationError('La solicitud tardó demasiado. Intente con menos tiendas.');
      } else {
        setCalculationError(err instanceof Error ? err.message : 'Error desconocido');
      }
    } finally {
      setCalculating(false);
    }
  };

  // Navegación
  const handleNext = () => {
    if (currentStep === 1) {
      // Después del paso 1, calcular pedidos
      calcularPedidos();
    } else if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCancel = () => {
    if (confirm('¿Estás seguro que deseas cancelar? Se perderán los cambios.')) {
      navigate('/pedidos-sugeridos');
    }
  };

  const updateOrderData = (data: Partial<OrderDataMultiTienda>) => {
    setOrderData(prev => ({ ...prev, ...data }));
  };

  // Renderizar indicador de paso
  const renderStepIndicator = (step: WizardStepInfo, index: number) => {
    const isCompleted = currentStep > step.number;
    const isCurrent = currentStep === step.number;

    return (
      <li key={step.name} className="relative flex items-center">
        <div className="flex items-center gap-x-2">
          {index !== 0 && (
            <div className={`h-0.5 w-8 ${isCompleted ? 'bg-gray-900' : 'bg-gray-200'}`}></div>
          )}
          {isCompleted ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900">
              <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          ) : isCurrent ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900">
              <span className="text-white font-semibold text-xs">{step.number}</span>
            </div>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
              <span className="text-gray-500 text-xs">{step.number}</span>
            </div>
          )}
          <div className="text-xs">
            <div className={`font-medium ${isCurrent ? 'text-gray-900' : 'text-gray-500'}`}>
              {step.name}
            </div>
          </div>
          {index !== steps.length - 1 && (
            <div className={`h-0.5 w-8 ${isCompleted ? 'bg-gray-900' : 'bg-gray-200'}`}></div>
          )}
        </div>
      </li>
    );
  };

  const logicalStep = getLogicalStep(currentStep);

  return (
    <div className="space-y-2 w-full max-w-none px-1">
      {/* Header con badge multi-tienda */}
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          Multi-Tienda
        </span>
      </div>

      {/* Progress Steps */}
      <nav aria-label="Progress" className="pb-1">
        <ol className="flex items-center justify-center gap-x-8">
          {steps.map((step, index) => renderStepIndicator(step, index))}
        </ol>
      </nav>

      {/* Error de cálculo */}
      {calculationError && (
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error en cálculo</h3>
                <p className="mt-1 text-sm text-red-700">{calculationError}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {calculating && (
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-lg border border-gray-200 p-8">
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-gray-600 font-medium">Calculando pedidos...</p>
              <p className="mt-1 text-sm text-gray-500">
                Analizando demanda y stock de{' '}
                {orderData.tiendas_seleccionadas.filter(t => t.seleccionada).length} tiendas
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step Content */}
      {!calculating && (
        <div className="mt-2">
          {logicalStep === 'select' && (
            <StepOneMultiSelect
              orderData={orderData}
              updateOrderData={updateOrderData}
              onNext={handleNext}
              onCancel={handleCancel}
            />
          )}

          {logicalStep === 'conflicts' && calculationResult && (
            <StepTwoConflictResolution
              orderData={orderData}
              calculationResult={calculationResult}
              updateOrderData={updateOrderData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {logicalStep === 'review' && calculationResult && (
            <StepThreeReviewTabs
              orderData={orderData}
              calculationResult={calculationResult}
              updateOrderData={updateOrderData}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {logicalStep === 'confirm' && calculationResult && (
            <StepFourConfirmation
              orderData={orderData}
              calculationResult={calculationResult}
              onBack={handleBack}
            />
          )}
        </div>
      )}
    </div>
  );
}
