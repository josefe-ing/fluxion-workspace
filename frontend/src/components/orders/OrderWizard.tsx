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
  prom_ventas_5dias_unid: number;
  prom_ventas_20dias_unid: number;
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
  cuadrante_producto: string | null;
  stock_minimo: number;
  stock_maximo: number;
  stock_seguridad: number;
  punto_reorden: number;
  cantidad_sugerida_unid: number;
  cantidad_sugerida_bultos: number;
  cantidad_ajustada_bultos: number;
  razon_pedido: string;
  cantidad_pedida_bultos?: number;
  incluido?: boolean;
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
    <div className="space-y-6 w-full max-w-none px-4">
      {/* Breadcrumb / Steps */}
      <nav aria-label="Progress" className="pb-20">
        <ol className="flex items-center justify-center gap-x-32">
          {steps.map((step, stepIdx) => (
            <li
              key={step.name}
              className="relative flex flex-col items-center"
            >
              <div className="flex flex-col items-center">
                <div className="flex items-center">
                  {stepIdx !== 0 && (
                    <div className="h-0.5 w-32 bg-gray-200 mr-8"></div>
                  )}
                  {currentStep > step.number ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : currentStep === step.number ? (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-900 bg-white">
                      <span className="text-gray-900 font-semibold">{step.number}</span>
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
                      <span className="text-gray-500">{step.number}</span>
                    </div>
                  )}
                  {stepIdx !== steps.length - 1 && (
                    <div className="h-0.5 w-32 bg-gray-200 ml-8"></div>
                  )}
                </div>
                <div className="mt-3 text-center max-w-[200px]">
                  <div className="text-sm font-medium text-gray-900">{step.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{step.description}</div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="mt-8">
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
