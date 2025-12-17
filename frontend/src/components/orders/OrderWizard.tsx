import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OrderStepOne from './OrderStepOne';
import OrderStepTwo from './OrderStepTwo';
import OrderStepThree from './OrderStepThree';

export interface OrderData {
  cedi_origen: string;
  cedi_origen_nombre: string;
  tienda_destino: string;
  tienda_destino_nombre: string;
  productos: ProductoPedido[];
  observaciones: string;
}

export interface ProductoPedido {
  codigo_producto: string;
  codigo_barras: string | null;
  descripcion_producto: string;
  categoria: string;
  grupo: string | null;
  subgrupo: string | null;
  marca: string | null;
  presentacion: string | null;
  cantidad_bultos: number;
  peso_unidad: number; // Peso por unidad en gramos
  prom_ventas_5dias_unid: number;
  prom_ventas_20dias_unid: number;
  prom_top3_unid: number;  // Promedio TOP 3 días con más ventas
  prom_p75_unid: number;   // Percentil 75 de ventas diarias
  prom_mismo_dia_unid: number;
  prom_ventas_8sem_unid: number;
  prom_ventas_8sem_bultos: number;
  prom_ventas_3dias_unid: number;
  prom_ventas_3dias_bultos: number;
  prom_mismo_dia_bultos: number;
  pronostico_3dias_unid: number;
  pronostico_3dias_bultos: number;
  stock_tienda: number;
  stock_en_transito: number;
  stock_total: number;
  stock_total_bultos: number;
  stock_dias_cobertura: number;
  stock_cedi_seco: number;
  stock_cedi_frio: number;
  stock_cedi_verde: number;
  stock_cedi_origen: number;
  clasificacion_abc: string | null;
  clase_efectiva: string | null;      // Clase usada para calculo (puede diferir por generador trafico)
  es_generador_trafico: boolean;      // Si es generador de trafico
  cuadrante_producto: string | null;
  stock_minimo: number;
  stock_maximo: number;
  stock_seguridad: number;
  punto_reorden: number;
  cantidad_sugerida_unid: number;
  cantidad_sugerida_bultos: number;
  cantidad_ajustada_bultos: number;
  razon_pedido: string;
  metodo_calculo: string;             // estadistico o padre_prudente
  unidad_medida?: string;             // Unidad de medida (UND, KG, etc)
  es_top50?: boolean;                 // Si es producto Top 50
  // Sobrestock
  tiene_sobrestock: boolean;
  exceso_unidades: number;
  exceso_bultos: number;
  dias_exceso: number;
  // Límites de inventario (capacidad máxima y mínimo exhibición)
  capacidad_maxima_configurada?: number;
  ajustado_por_capacidad?: boolean;
  minimo_exhibicion_configurado?: number;
  ajustado_por_minimo_exhibicion?: boolean;
  // Warnings de sanity checks
  warnings_calculo: string[];
  cantidad_pedida_bultos?: number;
  incluido?: boolean;
  // === CAMPOS V2 (Cobertura Real por Día de Semana) ===
  v2_prom_dow?: number[];  // Array de 7 elementos con promedio de cada día
  v2_demanda_periodo?: number;  // Suma de demanda real del período
  v2_cantidad_sugerida_unid?: number;
  v2_cantidad_sugerida_bultos?: number;
  v2_diferencia_bultos?: number;  // V2 - V1 (positivo = V2 pide más)
  v2_cobertura_dias?: {
    dia: string;
    fecha: string;  // "20 Dic"
    dow: number;
    demanda_unid: number;
    demanda_bultos: number;
    stock_antes: number;
    stock_despues: number;
    cobertura_pct: number;
    estado: 'ok' | 'riesgo' | 'quiebre';
  }[];
  v2_dias_cobertura_real?: number;
  v2_primer_dia_riesgo?: string | null;
  v2_dia_pedido?: string;
  v2_dia_llegada?: string;
  v2_fecha_pedido?: string;  // "18 Dic"
  v2_fecha_llegada?: string;  // "19 Dic"
  v2_dias_cobertura_config?: number;  // Días de cobertura según config ABC
  v2_lead_time_config?: number;  // Lead time según config
  v2_historico_dow?: {
    dow: number;
    nombre: string;
    promedio: number;
    dias_con_data: number;
    detalle: { fecha: string; venta: number }[];
  }[];
}

export default function OrderWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [orderData, setOrderData] = useState<OrderData>({
    cedi_origen: '',
    cedi_origen_nombre: '',
    tienda_destino: '',
    tienda_destino_nombre: '',
    productos: [],
    observaciones: '',
  });

  const steps = [
    { number: 1, name: 'Origen y Destino', description: 'Seleccionar CEDI y tienda' },
    { number: 2, name: 'Productos', description: 'Revisar y ajustar cantidades' },
    { number: 3, name: 'Confirmación', description: 'Revisar y enviar pedido' },
  ];

  const handleNext = () => {
    if (currentStep < 3) {
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

  const updateOrderData = (data: Partial<OrderData>) => {
    setOrderData(prev => ({ ...prev, ...data }));
  };

  return (
    <div className="space-y-2 w-full max-w-none px-1">
      {/* Breadcrumb / Steps - COMPACTO */}
      <nav aria-label="Progress" className="pb-1">
        <ol className="flex items-center justify-center gap-x-8">
          {steps.map((step, stepIdx) => (
            <li
              key={step.name}
              className="relative flex items-center"
            >
              <div className="flex items-center gap-x-2">
                {stepIdx !== 0 && (
                  <div className="h-0.5 w-8 bg-gray-200"></div>
                )}
                {currentStep > step.number ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900">
                    <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : currentStep === step.number ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900">
                    <span className="text-white font-semibold text-xs">{step.number}</span>
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
                    <span className="text-gray-500 text-xs">{step.number}</span>
                  </div>
                )}
                <div className="text-xs">
                  <div className={`font-medium ${currentStep === step.number ? 'text-gray-900' : 'text-gray-500'}`}>
                    {step.name}
                  </div>
                </div>
                {stepIdx !== steps.length - 1 && (
                  <div className="h-0.5 w-8 bg-gray-200"></div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="mt-2">
        {currentStep === 1 && (
          <OrderStepOne
            orderData={orderData}
            updateOrderData={updateOrderData}
            onNext={handleNext}
            onCancel={handleCancel}
          />
        )}
        {currentStep === 2 && (
          <OrderStepTwo
            orderData={orderData}
            updateOrderData={updateOrderData}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}
        {currentStep === 3 && (
          <OrderStepThree
            orderData={orderData}
            onBack={handleBack}
          />
        )}
      </div>
    </div>
  );
}
