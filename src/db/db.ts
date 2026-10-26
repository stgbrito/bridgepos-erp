import Dexie, { type Table } from 'dexie';

// ==========================================
// 1. TIPOS Y CONSTANTES CORPORATIVAS (DGII RD)
// ==========================================

export type BrandId =
  | 'bridge-tech'
  | 'atelier'
  | 'sb-mantenimiento'
  | 'metro-food';

export type ModuleType =
  | 'SERVICE_MODULE'
  | 'RETAIL_MODULE'
  | 'RESTAURANT_MODULE';

export type NCFType = 'B01' | 'B02' | 'B04' | 'B11' | 'B13';

export type InternalDocType =
  | 'COTIZACION'
  | 'ORDEN_DE_SERVICIO'
  | 'RECIBO_DE_ABONO'
  | 'RECIBO_DE_PAGO';

export type ServiceOrderStatus =
  | 'COTIZACION'
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'LISTO'
  | 'ENTREGADO';

export type PaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA';

export type UserRole = 'ADMIN' | 'CAJERO' | 'CAMARERO' | 'TECNICO';

export interface StaffUser {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  active: boolean;
}

export interface AuditLogEntry {
  id?: number;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  brandId: BrandId;
  action: string;
  details: string;
}

export interface DiscountPromoCode {
  code: string; // Primary key ej. 'VIP10'
  description: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  active: boolean;
}

export interface CashShift {
  id?: number;
  openedAt: string;
  closedAt?: string;
  cashierId: string;
  cashierName: string;
  brandId: BrandId;
  initialCash: number;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalSales: number;
  countedCash?: number;
  difference?: number;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
}

export interface InvoiceItemExtra {
  id: string;
  name: string;
  price: number;
}

export interface CorporateConfig {
  id: string; // 'corporate-main'
  legalName: string; // Bridge to Solutions, S.R.L.
  rnc: string; // 133494442
  regMercantil: string; // 856888
  dgiiRequestNumber: string; // 6010057286
  itbisRate: number; // 0.18 (18%)
  legalTipRate: number; // 0.10 (10% Propina Legal RD)
  address: string;
  email: string;
  updatedAt: string;
}

export interface BrandProfile {
  id: BrandId;
  name: string;
  subtitle: string;
  logoUrl: string;
  phone: string;
  accentColor: string;
  badgeClass: string;
  activeModules: ModuleType[];
  defaultInternalDocTitle: InternalDocType;
  internalPrefix: string; // ej. 'ORD', 'REC'
  internalCounter: number; // Secuencia interna (ej. 1 -> ORD-0001)
  quoteCounter?: number; // Secuencia de cotización (ej. 1 -> QUOTE-0001)
  enableLegalTipByDefault: boolean;
  defaultDepositPercentage: number; // ej. 50% inicial / 50% entrega
}

export interface NCFSequence {
  type: NCFType; // Primary key: 'B01' | 'B02' | 'B04' | 'B11' | 'B13'
  name: string;
  description: string;
  dgiiRequestNo: string; // '6010057286'
  authorizationNo: string; // ej. '5005602888'
  seriesPrefix: NCFType;
  rangeStartFormatted: string; // ej. 'B0100000001'
  rangeEndFormatted: string; // ej. 'B0100000015'
  startNumber: number; // 1
  currentNumber: number; // Próximo número a consumir (1..limit)
  limitNumber: number; // Límite aprobado por DGII
  expirationDate: string; // '31/12/2027' o 'N/A'
  direction: 'VENTA_607' | 'COMPRA_606_GASTO';
  isActive: boolean;
  warningThreshold: number;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  code?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxExempt?: boolean;
  discount?: number;
  notes?: string;
  station?: 'COCINA' | 'BAR';
  sentQuantity?: number;
  course?: 'ENTRADA' | 'FUERTE' | 'POSTRE' | 'BEBIDA';
  isCourtesy?: boolean;
  extras?: InvoiceItemExtra[];
  costType?: 'MANO_DE_OBRA' | 'MATERIALES' | 'GENERAL';
}

export interface IssuedDocument {
  id?: number;
  documentCode: string; // NCF (B0100000001) si isFiscal=true, o Interno (ORD-0001) si isFiscal=false
  brandId: BrandId;
  brandName: string;
  moduleUsed: ModuleType;
  isFiscal: boolean; // CRÍTICO: Modo Fiscal Dual
  ncfType?: NCFType;
  ncfNumber?: string;
  modifiedNcf?: string; // Para Notas de Crédito B04 en el 607
  authorizationNo?: string;
  expirationDate?: string;
  internalDocTitle?: InternalDocType;
  customerName: string;
  customerRncOrCedula?: string;
  customerPhone?: string;
  paymentMethod?: PaymentMethod;
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  itbisAmount: number; // 0 en Modo Interno, 18% desglosado en Modo Fiscal
  legalTipAmount: number; // 10% opcional en Restaurante
  voluntaryTipAmount?: number; // Propina Voluntaria / Extra Camarero (No altera base ITBIS ni 607)
  isrRetentionAmount?: number; // Para B11
  itbisRetentionAmount?: number; // Para B11
  totalAmount: number;
  amountPaid: number; // Soporte de Abonos parciales (ej. 50% inicial)
  balanceDue: number;
  goesTo607: boolean; // false si isFiscal === false
  goesTo606: boolean; // true para B11 / B13
  createdAt: string;
  syncStatus: 'LOCAL_ONLY' | 'SYNCED';
}

// ==========================================
// 2. TIPOS FASE 2: CLIENTES, CATÁLOGO Y ÓRDENES DE SERVICIO
// ==========================================

export interface AtelierMeasurements {
  bust?: string; // Busto (cm/pulg)
  waist?: string; // Cintura
  hips?: string; // Cadera
  length?: string; // Largo
}

export interface ClientProfile {
  id?: number;
  name: string;
  rncOrCedula: string;
  phone: string;
  email?: string;
  preferredNcfType: 'B01' | 'B02';
  notes?: string;
  measurements?: AtelierMeasurements;
  createdAt: string;
}

export interface CatalogItem {
  id?: number;
  brandId: BrandId;
  code: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  isService: boolean;
  stock?: number;
  taxExempt?: boolean;
  station?: 'COCINA' | 'BAR';
  active: boolean;
}

export interface AtelierOrderSpec {
  bust: string;
  waist: string;
  hips: string;
  length: string;
  fabricAndDesign: string;
  fittingDate: string;
  deliveryDate: string;
}

export interface TechnicalOrderSpec {
  equipmentOrArea: string;
  serialOrModel: string;
  diagnosisAndWork: string;
  warrantyPeriod: string;
  deliveryDate: string;
}

export interface OrderPaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  note: string;
  receiptCode: string;
  isFiscalReceipt?: boolean;
  ncfNumber?: string;
}

export interface ServiceOrder {
  id?: number;
  orderCode: string; // QUOTE-0001 o ORD-0001
  brandId: BrandId;
  brandName: string;
  status: ServiceOrderStatus;
  clientId?: number;
  clientName: string;
  clientRncOrCedula: string;
  clientPhone: string;
  items: InvoiceItem[];
  // Estado Fiscal Dual de la Orden
  isFiscal: boolean;
  ncfType?: 'B01' | 'B02';
  ncfNumber?: string;
  authorizationNo?: string;
  expirationDate?: string;
  // Importes
  subtotal: number;
  discountTotal?: number;
  promoCodeApplied?: string;
  separateLaborAndMaterials?: boolean;
  itbisAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  payments: OrderPaymentRecord[];
  // Campos dinámicos según unidad de negocio
  atelierSpec?: AtelierOrderSpec;
  techSpec?: TechnicalOrderSpec;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type RestaurantZone = 'SALON' | 'TERRAZA' | 'VIP' | 'EVENTOS';

export type TableStatus = 'LIBRE' | 'OCUPADA' | 'PRE_CUENTA';

export type RestaurantOrderType = 'SALON' | 'PARA_LLEVAR' | 'DELIVERY';

export interface RestaurantTableAccount {
  id: string; // ej. 'mesa-1'
  name: string; // ej. 'Mesa 01'
  zone: RestaurantZone;
  capacity: number;
  status: TableStatus;
  guests: number;
  waiterName: string;
  clientName: string;
  clientRncOrCedula: string;
  includeLegalTip: boolean;
  orderType?: RestaurantOrderType;
  splitWays: number;
  items: InvoiceItem[];
  openedAt?: string;
}

// ==========================================
// 3. SEED DATA OFICIAL (BRIDGE TO SOLUTIONS, S.R.L.)
// ==========================================

export const INITIAL_CORPORATE_CONFIG: CorporateConfig = {
  id: 'corporate-main',
  legalName: 'Bridge to Solutions, S.R.L.',
  rnc: '133494442',
  regMercantil: '856888',
  dgiiRequestNumber: '6010057286',
  itbisRate: 0.18,
  legalTipRate: 0.10,
  address: 'Santo Domingo, República Dominicana',
  email: 'facturacion@bridgetosolutions.com',
  updatedAt: new Date().toISOString(),
};

export const INITIAL_BRANDS: BrandProfile[] = [
  {
    id: 'bridge-tech',
    name: 'Bridge to Solutions',
    subtitle: 'IT, Software & Smart Home',
    logoUrl: '/logos/bridge-logo.svg',
    phone: '829-781-0716',
    accentColor: '#0D9488',
    badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    activeModules: ['SERVICE_MODULE', 'RETAIL_MODULE'],
    defaultInternalDocTitle: 'ORDEN_DE_SERVICIO',
    internalPrefix: 'ORD',
    internalCounter: 2,
    quoteCounter: 2,
    enableLegalTipByDefault: false,
    defaultDepositPercentage: 50,
  },
  {
    id: 'atelier',
    name: 'Juana de Jesús • Atelier',
    subtitle: 'Alta Costura & Uniformes',
    logoUrl: '/logos/atelier-logo.svg',
    phone: '809-794-4253',
    accentColor: '#D4AF37',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    activeModules: ['SERVICE_MODULE'],
    defaultInternalDocTitle: 'ORDEN_DE_SERVICIO',
    internalPrefix: 'ORD',
    internalCounter: 2,
    quoteCounter: 2,
    enableLegalTipByDefault: false,
    defaultDepositPercentage: 50,
  },
  {
    id: 'sb-mantenimiento',
    name: 'Soluciones Brito',
    subtitle: 'Mantenimiento & Climatización',
    logoUrl: '/logos/sb-logo.png',
    phone: '829-781-0716',
    accentColor: '#0284C7',
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    activeModules: ['SERVICE_MODULE', 'RETAIL_MODULE'],
    defaultInternalDocTitle: 'ORDEN_DE_SERVICIO',
    internalPrefix: 'ORD',
    internalCounter: 2,
    quoteCounter: 2,
    enableLegalTipByDefault: false,
    defaultDepositPercentage: 50,
  },
  {
    id: 'metro-food',
    name: 'Metro Food Station',
    subtitle: 'Restaurante, Fast Food & Eventos',
    logoUrl: '/logos/metro-logo.png',
    phone: '829-781-0716',
    accentColor: '#F97316',
    badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    activeModules: ['RESTAURANT_MODULE', 'RETAIL_MODULE'],
    defaultInternalDocTitle: 'RECIBO_DE_PAGO',
    internalPrefix: 'ORD',
    internalCounter: 1,
    quoteCounter: 1,
    enableLegalTipByDefault: true,
    defaultDepositPercentage: 100,
  },
];

/**
 * Secuencias NCF Reales Aprobadas por DGII
 * Solicitud DGII No. 6010057286 - Bridge to Solutions, S.R.L. (RNC 133494442)
 */
export const INITIAL_NCF_SEQUENCES: NCFSequence[] = [
  {
    type: 'B01',
    name: 'Factura de Crédito Fiscal',
    description:
      'Para empresas y contribuyentes que requieren sustentar costos y gastos o crédito de ITBIS.',
    dgiiRequestNo: '6010057286',
    authorizationNo: '5005602888',
    seriesPrefix: 'B01',
    rangeStartFormatted: 'B0100000001',
    rangeEndFormatted: 'B0100000015',
    startNumber: 1,
    currentNumber: 1,
    limitNumber: 15,
    expirationDate: '31/12/2027',
    direction: 'VENTA_607',
    isActive: true,
    warningThreshold: 3,
    updatedAt: new Date().toISOString(),
  },
  {
    type: 'B02',
    name: 'Factura de Consumo',
    description:
      'Para consumidores finales con desglose de 18% ITBIS y respaldo fiscal oficial.',
    dgiiRequestNo: '6010057286',
    authorizationNo: '5005602887',
    seriesPrefix: 'B02',
    rangeStartFormatted: 'B0200000001',
    rangeEndFormatted: 'B0200000030',
    startNumber: 1,
    currentNumber: 1,
    limitNumber: 30,
    expirationDate: 'N/A',
    direction: 'VENTA_607',
    isActive: true,
    warningThreshold: 5,
    updatedAt: new Date().toISOString(),
  },
  {
    type: 'B04',
    name: 'Nota de Crédito',
    description:
      'Anulaciones, devoluciones o descuentos posteriores sobre facturas emitidas.',
    dgiiRequestNo: '6010057286',
    authorizationNo: '5005602889',
    seriesPrefix: 'B04',
    rangeStartFormatted: 'B0400000001',
    rangeEndFormatted: 'B0400000005',
    startNumber: 1,
    currentNumber: 1,
    limitNumber: 5,
    expirationDate: 'N/A',
    direction: 'VENTA_607',
    isActive: true,
    warningThreshold: 2,
    updatedAt: new Date().toISOString(),
  },
  {
    type: 'B11',
    name: 'Comprobante de Compras',
    description:
      'Adquisición de bienes o servicios a proveedores informales no registrados.',
    dgiiRequestNo: '6010057286',
    authorizationNo: '5005602885',
    seriesPrefix: 'B11',
    rangeStartFormatted: 'B1100000001',
    rangeEndFormatted: 'B1100000001',
    startNumber: 1,
    currentNumber: 1,
    limitNumber: 1,
    expirationDate: '31/12/2027',
    direction: 'COMPRA_606_GASTO',
    isActive: true,
    warningThreshold: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    type: 'B13',
    name: 'Comprobante de Gastos Menores',
    description:
      'Gastos menores incurridos en el mercado informal (peajes, parqueos, consumibles).',
    dgiiRequestNo: '6010057286',
    authorizationNo: '5005602886',
    seriesPrefix: 'B13',
    rangeStartFormatted: 'B1300000001',
    rangeEndFormatted: 'B1300000001',
    startNumber: 1,
    currentNumber: 1,
    limitNumber: 1,
    expirationDate: '31/12/2027',
    direction: 'COMPRA_606_GASTO',
    isActive: true,
    warningThreshold: 1,
    updatedAt: new Date().toISOString(),
  },
];

// ==========================================
// 4. SEED DATA FASE 2: CLIENTES Y CATÁLOGO MULTI-MARCA
// ==========================================

export const INITIAL_CLIENTS: ClientProfile[] = [
  {
    id: 1,
    name: 'Grupo Corporativo Almonte, S.R.L.',
    rncOrCedula: '131445982',
    phone: '809-555-0192',
    email: 'compras@grupoalmonte.com.do',
    preferredNcfType: 'B01',
    notes: 'Cliente corporativo IT y climatización de oficinas.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'Dra. Carolina Méndez',
    rncOrCedula: '00114892031',
    phone: '829-641-8820',
    email: 'cmendez@clinica.do',
    preferredNcfType: 'B02',
    notes: 'Clienta frecuente de Alta Costura y uniformes médicos.',
    measurements: {
      bust: '92 cm',
      waist: '70 cm',
      hips: '98 cm',
      length: '148 cm',
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: 'Constructora & Inmobiliaria Del Este, S.A.',
    rncOrCedula: '130998214',
    phone: '809-722-4500',
    email: 'ingenieria@constructoraeste.do',
    preferredNcfType: 'B01',
    notes: 'Proyectos de domótica y climatización VRF.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 4,
    name: 'Licda. Valeria Santos',
    rncOrCedula: '40221983410',
    phone: '849-220-1190',
    email: 'valeria.santos@correo.do',
    preferredNcfType: 'B02',
    notes: 'Vestidos de gala a medida.',
    measurements: {
      bust: '88 cm',
      waist: '66 cm',
      hips: '94 cm',
      length: '152 cm',
    },
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_CATALOG_ITEMS: CatalogItem[] = [
  // 1. BRIDGE TO SOLUTIONS (bridge-tech)
  {
    brandId: 'bridge-tech',
    code: 'BT-DOM-01',
    name: 'Kit Automatización Smart Home (Iluminación + Cerradura Inteligente)',
    category: 'Smart Home',
    unit: 'PROY',
    price: 28500,
    isService: true,
    active: true,
  },
  {
    brandId: 'bridge-tech',
    code: 'BT-NET-02',
    name: 'Instalación Red Estructurada Cat6A + Configuración Rack & Firewall',
    category: 'Redes & IT',
    unit: 'SERV',
    price: 18500,
    isService: true,
    active: true,
  },
  {
    brandId: 'bridge-tech',
    code: 'BT-CCTV-03',
    name: 'Sistema CCTV IP 8 Cámaras 4K con Grabador NVR PoE',
    category: 'Seguridad Electrónica',
    unit: 'KIT',
    price: 34900,
    isService: false,
    stock: 6,
    active: true,
  },
  {
    brandId: 'bridge-tech',
    code: 'BT-DEV-04',
    name: 'Implementación y Licencia Sistema POS / ERP Empresarial',
    category: 'Software',
    unit: 'LIC',
    price: 45000,
    isService: true,
    active: true,
  },

  // 2. JUANA DE JESÚS • ATELIER (atelier)
  {
    brandId: 'atelier',
    code: 'AT-GAL-01',
    name: 'Confección Vestido de Gala Alta Costura a Medida',
    category: 'Alta Costura',
    unit: 'PIEZA',
    price: 22500,
    isService: true,
    active: true,
  },
  {
    brandId: 'atelier',
    code: 'AT-NOV-02',
    name: 'Diseño y Confección Traje de Novia Exclusivo (Bordado Artesanal)',
    category: 'Nupcial',
    unit: 'PIEZA',
    price: 65000,
    isService: true,
    active: true,
  },
  {
    brandId: 'atelier',
    code: 'AT-UNI-03',
    name: 'Set Uniformes Ejecutivos Corporativos (Chaqueta + Pantalón)',
    category: 'Uniformes',
    unit: 'SET',
    price: 6800,
    isService: true,
    active: true,
  },
  {
    brandId: 'atelier',
    code: 'AT-AJU-04',
    name: 'Entalle y Ajustes de Sastrería Fina en Prenda de Etiqueta',
    category: 'Sastrería',
    unit: 'SERV',
    price: 3500,
    isService: true,
    active: true,
  },

  // 3. SOLUCIONES BRITO (sb-mantenimiento)
  {
    brandId: 'sb-mantenimiento',
    code: 'SB-INS-01',
    name: 'Instalación Aire Acondicionado Split Inverter 18,000 - 24,000 BTU',
    category: 'Climatización',
    unit: 'SERV',
    price: 6500,
    isService: true,
    active: true,
  },
  {
    brandId: 'sb-mantenimiento',
    code: 'SB-MAN-02',
    name: 'Mantenimiento Profundo con Desmonte y Lavado Químico A/C',
    category: 'Mantenimiento',
    unit: 'UND',
    price: 2800,
    isService: true,
    active: true,
  },
  {
    brandId: 'sb-mantenimiento',
    code: 'SB-GAS-03',
    name: 'Recarga Completa Refrigerante Ecológico R410A / R32',
    category: 'Climatización',
    unit: 'SERV',
    price: 3400,
    isService: false,
    stock: 15,
    active: true,
  },
  {
    brandId: 'sb-mantenimiento',
    code: 'SB-ELE-04',
    name: 'Revisión y Balanceo de Carga en Panel Eléctrico Residencial/Comercial',
    category: 'Electricidad',
    unit: 'SERV',
    price: 7500,
    isService: true,
    active: true,
  },

  // 4. METRO FOOD STATION (metro-food)
  {
    brandId: 'metro-food',
    code: 'MF-BUR-01',
    name: 'Metro Double Smash Burger Angus con Papas Rústicas',
    category: 'Platos Fuertes',
    unit: 'UND',
    price: 695,
    isService: false,
    stock: 50,
    station: 'COCINA',
    active: true,
  },
  {
    brandId: 'metro-food',
    code: 'MF-PAR-02',
    name: 'Bandeja Parrillada Mixta Familiar (4 Personas)',
    category: 'Parrilla',
    unit: 'UND',
    price: 2450,
    isService: false,
    stock: 25,
    station: 'COCINA',
    active: true,
  },
  {
    brandId: 'metro-food',
    code: 'MF-CAT-03',
    name: 'Servicio Catering Ejecutivo / Estación Fast-Food Eventos (25 Pax)',
    category: 'Eventos',
    unit: 'PROY',
    price: 18500,
    isService: true,
    station: 'COCINA',
    active: true,
  },
  {
    brandId: 'metro-food',
    code: 'MF-BEB-04',
    name: 'Jarra Limonada Frappé con Hierbabuena (1.5 Lts)',
    category: 'Bebidas',
    unit: 'UND',
    price: 450,
    isService: false,
    stock: 40,
    station: 'BAR',
    active: true,
  },
  {
    brandId: 'metro-food',
    code: 'MF-TAC-05',
    name: 'Trío de Tacos Birria de Res con Consomé Artesanal',
    category: 'Platos Fuertes',
    unit: 'ORD',
    price: 580,
    isService: false,
    stock: 35,
    station: 'COCINA',
    active: true,
  },
  {
    brandId: 'metro-food',
    code: 'MF-POS-06',
    name: 'Cheesecake Artesanal de Chinola & Dulce de Leche',
    category: 'Postres',
    unit: 'PZA',
    price: 390,
    isService: false,
    stock: 20,
    station: 'COCINA',
    active: true,
  },
  // EQUIPOS RETAIL ADICIONALES
  {
    brandId: 'bridge-tech',
    code: 'BT-SWI-05',
    name: 'Switch Administrable PoE+ 24 Puertos Gigabit',
    category: 'Redes & IT',
    unit: 'UND',
    price: 14800,
    isService: false,
    stock: 12,
    active: true,
  },
  {
    brandId: 'bridge-tech',
    code: 'BT-LCK-06',
    name: 'Cerradura Inteligente Biométrica Wi-Fi / Zigbee',
    category: 'Smart Home',
    unit: 'PZA',
    price: 9600,
    isService: false,
    stock: 18,
    active: true,
  },
  {
    brandId: 'sb-mantenimiento',
    code: 'SB-TER-05',
    name: 'Termostato Digital Inteligente Wi-Fi Universal',
    category: 'Climatización',
    unit: 'PZA',
    price: 4950,
    isService: false,
    stock: 14,
    active: true,
  },
  {
    brandId: 'sb-mantenimiento',
    code: 'SB-BOM-06',
    name: 'Bomba de Condensado Silenciosa para A/C Split',
    category: 'Repuestos',
    unit: 'UND',
    price: 3800,
    isService: false,
    stock: 9,
    active: true,
  },
];

export const INITIAL_RESTAURANT_TABLES: RestaurantTableAccount[] = [
  {
    id: 'mesa-01',
    name: 'Mesa 01',
    zone: 'SALON',
    capacity: 4,
    status: 'OCUPADA',
    guests: 3,
    waiterName: 'Carlos R.',
    clientName: 'Mesa 01 • Salón',
    clientRncOrCedula: '',
    includeLegalTip: true,
    splitWays: 3,
    openedAt: new Date().toISOString(),
    items: [
      {
        id: 'm1-1',
        code: 'MF-PAR-02',
        description: 'Bandeja Parrillada Mixta Familiar (4 Personas)',
        quantity: 1,
        sentQuantity: 1,
        station: 'COCINA',
        course: 'FUERTE',
        unit: 'UND',
        unitPrice: 2450,
      },
      {
        id: 'm1-2',
        code: 'MF-BEB-04',
        description: 'Jarra Limonada Frappé con Hierbabuena (1.5 Lts)',
        quantity: 2,
        sentQuantity: 2,
        station: 'BAR',
        course: 'BEBIDA',
        unit: 'UND',
        unitPrice: 450,
      },
    ],
  },
  {
    id: 'mesa-02',
    name: 'Mesa 02',
    zone: 'SALON',
    capacity: 4,
    status: 'LIBRE',
    guests: 2,
    waiterName: 'Carlos R.',
    clientName: 'Consumidor Final',
    clientRncOrCedula: '',
    includeLegalTip: true,
    splitWays: 1,
    items: [],
  },
  {
    id: 'mesa-03',
    name: 'Mesa 03',
    zone: 'SALON',
    capacity: 6,
    status: 'LIBRE',
    guests: 4,
    waiterName: 'Laura M.',
    clientName: 'Consumidor Final',
    clientRncOrCedula: '',
    includeLegalTip: true,
    splitWays: 1,
    items: [],
  },
  {
    id: 'mesa-04',
    name: 'Mesa 04',
    zone: 'TERRAZA',
    capacity: 4,
    status: 'PRE_CUENTA',
    guests: 2,
    waiterName: 'Laura M.',
    clientName: 'Ing. Roberto Díaz',
    clientRncOrCedula: '00112938412',
    includeLegalTip: true,
    splitWays: 2,
    openedAt: new Date().toISOString(),
    items: [
      {
        id: 'm4-1',
        code: 'MF-BUR-01',
        description: 'Metro Double Smash Burger Angus con Papas Rústicas',
        quantity: 2,
        unit: 'UND',
        unitPrice: 695,
      },
      {
        id: 'm4-2',
        code: 'MF-POS-06',
        description: 'Cheesecake Artesanal de Chinola & Dulce de Leche',
        quantity: 2,
        unit: 'PZA',
        unitPrice: 390,
      },
    ],
  },
  {
    id: 'mesa-05',
    name: 'Mesa 05',
    zone: 'TERRAZA',
    capacity: 4,
    status: 'LIBRE',
    guests: 2,
    waiterName: 'Laura M.',
    clientName: 'Consumidor Final',
    clientRncOrCedula: '',
    includeLegalTip: true,
    splitWays: 1,
    items: [],
  },
  {
    id: 'mesa-06',
    name: 'Reservado VIP 01',
    zone: 'VIP',
    capacity: 8,
    status: 'LIBRE',
    guests: 6,
    waiterName: 'Carlos R.',
    clientName: 'Consumidor Final',
    clientRncOrCedula: '',
    includeLegalTip: true,
    splitWays: 1,
    items: [],
  },
  {
    id: 'mesa-07',
    name: 'Reservado VIP 02',
    zone: 'VIP',
    capacity: 10,
    status: 'LIBRE',
    guests: 8,
    waiterName: 'Carlos R.',
    clientName: 'Consumidor Final',
    clientRncOrCedula: '',
    includeLegalTip: true,
    splitWays: 1,
    items: [],
  },
  {
    id: 'mesa-08',
    name: 'Barra / Fast-Food 01',
    zone: 'EVENTOS',
    capacity: 2,
    status: 'LIBRE',
    guests: 1,
    waiterName: 'Caja Rápida',
    clientName: 'Consumidor Final',
    clientRncOrCedula: '',
    includeLegalTip: false,
    splitWays: 1,
    items: [],
  },
];

export const INITIAL_SERVICE_ORDERS: ServiceOrder[] = [
  {
    orderCode: 'ORD-0001',
    brandId: 'atelier',
    brandName: 'Juana de Jesús • Atelier',
    status: 'EN_PROCESO',
    clientId: 2,
    clientName: 'Dra. Carolina Méndez',
    clientRncOrCedula: '00114892031',
    clientPhone: '829-641-8820',
    items: [
      {
        id: '1',
        code: 'AT-GAL-01',
        description: 'Confección Vestido de Gala Alta Costura a Medida',
        quantity: 1,
        unit: 'PIEZA',
        unitPrice: 22500,
      },
    ],
    isFiscal: false,
    subtotal: 22500,
    itbisAmount: 0,
    totalAmount: 22500,
    amountPaid: 11250,
    balanceDue: 11250,
    payments: [
      {
        id: 'pay-1',
        date: new Date().toISOString(),
        amount: 11250,
        method: 'TRANSFERENCIA',
        note: 'Abono inicial 50% al tomar medidas',
        receiptCode: 'ABONO-0001',
      },
    ],
    atelierSpec: {
      bust: '92 cm',
      waist: '70 cm',
      hips: '98 cm',
      length: '148 cm',
      fabricAndDesign: 'Crepé de seda verde esmeralda con recamado en pedrería dorada',
      fittingDate: '2026-11-02',
      deliveryDate: '2026-11-10',
    },
    notes: 'Primera prueba programada en atelier.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    orderCode: 'ORD-0001',
    brandId: 'bridge-tech',
    brandName: 'Bridge to Solutions',
    status: 'EN_PROCESO',
    clientId: 1,
    clientName: 'Grupo Corporativo Almonte, S.R.L.',
    clientRncOrCedula: '131445982',
    clientPhone: '809-555-0192',
    items: [
      {
        id: '1',
        code: 'BT-DOM-01',
        description: 'Kit Automatización Smart Home (Iluminación + Cerradura Inteligente)',
        quantity: 1,
        unit: 'PROY',
        unitPrice: 28500,
      },
      {
        id: '2',
        code: 'BT-NET-02',
        description: 'Instalación Red Estructurada Cat6A + Configuración Rack & Firewall',
        quantity: 1,
        unit: 'SERV',
        unitPrice: 18500,
      },
    ],
    isFiscal: false,
    subtotal: 47000,
    itbisAmount: 0,
    totalAmount: 47000,
    amountPaid: 23500,
    balanceDue: 23500,
    payments: [
      {
        id: 'pay-bt-1',
        date: new Date().toISOString(),
        amount: 23500,
        method: 'TRANSFERENCIA',
        note: 'Avance 50% inicio de proyecto',
        receiptCode: 'ABONO-0001',
      },
    ],
    techSpec: {
      equipmentOrArea: 'Salón de Conferencias & Cuarto de Servidores Piso 3',
      serialOrModel: 'Ubiquiti UniFi Dream Machine Pro + Cerradura Yale Zigbee',
      diagnosisAndWork: 'Cableado de 12 puntos de red Cat6A, configuración VLAN corporativa y control de acceso biométrico.',
      warrantyPeriod: '12 Meses en equipos e instalación',
      deliveryDate: '2026-10-30',
    },
    notes: 'El cliente solicitará Factura con Crédito Fiscal (B01) al finalizar la entrega.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    orderCode: 'QUOTE-0001',
    brandId: 'sb-mantenimiento',
    brandName: 'Soluciones Brito',
    status: 'COTIZACION',
    clientId: 3,
    clientName: 'Constructora & Inmobiliaria Del Este, S.A.',
    clientRncOrCedula: '130998214',
    clientPhone: '809-722-4500',
    items: [
      {
        id: '1',
        code: 'SB-INS-01',
        description: 'Instalación Aire Acondicionado Split Inverter 18,000 - 24,000 BTU',
        quantity: 3,
        unit: 'SERV',
        unitPrice: 6500,
      },
      {
        id: '2',
        code: 'SB-MAN-02',
        description: 'Mantenimiento Profundo con Desmonte y Lavado Químico A/C',
        quantity: 4,
        unit: 'UND',
        unitPrice: 2800,
      },
    ],
    isFiscal: false,
    subtotal: 30700,
    itbisAmount: 0,
    totalAmount: 30700,
    amountPaid: 0,
    balanceDue: 30700,
    payments: [],
    techSpec: {
      equipmentOrArea: 'Oficinas Administrativas Proyecto Vista Mar',
      serialOrModel: '3x Carrier Inverter 24,000 BTU SEER 21',
      diagnosisAndWork: 'Instalación con tubería de cobre aislada, vacío con bomba micrométrica y mantenimiento preventivo de 4 unidades existentes.',
      warrantyPeriod: '6 Meses en mano de obra',
      deliveryDate: '2026-10-29',
    },
    notes: 'Cotización válida por 15 días. Requiere 50% de inicial para agendar brigada técnica.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const INITIAL_STAFF_USERS: StaffUser[] = [
  {
    id: 'user-admin',
    name: 'Santiago Brito',
    role: 'ADMIN',
    pin: '1234',
    active: true,
  },
  {
    id: 'user-cajero',
    name: 'Caja Principal',
    role: 'CAJERO',
    pin: '0000',
    active: true,
  },
  {
    id: 'user-camarero-1',
    name: 'Carlos R.',
    role: 'CAMARERO',
    pin: '1111',
    active: true,
  },
  {
    id: 'user-camarero-2',
    name: 'Laura M.',
    role: 'CAMARERO',
    pin: '2222',
    active: true,
  },
  {
    id: 'user-tecnico',
    name: 'Alam Brito',
    role: 'TECNICO',
    pin: '3333',
    active: true,
  },
];

export const INITIAL_PROMO_CODES: DiscountPromoCode[] = [
  {
    code: 'VIP10',
    description: 'Descuento Cliente VIP (10%)',
    type: 'PERCENT',
    value: 10,
    active: true,
  },
  {
    code: 'DESC15',
    description: 'Promoción Especial Corporativa (15%)',
    type: 'PERCENT',
    value: 15,
    active: true,
  },
  {
    code: 'FAMILIA20',
    description: 'Descuento Amigos y Familia (20%)',
    type: 'PERCENT',
    value: 20,
    active: true,
  },
  {
    code: 'BONO500',
    description: 'Bono de Descuento Directo (RD$ 500)',
    type: 'FIXED',
    value: 500,
    active: true,
  },
];

// ==========================================
// 5. CLASE DE BASE DE DATOS DEXIE
// ==========================================

export class BridgePOSDatabase extends Dexie {
  corporateConfig!: Table<CorporateConfig, string>;
  brands!: Table<BrandProfile, BrandId>;
  ncfSequences!: Table<NCFSequence, NCFType>;
  documents!: Table<IssuedDocument, number>;
  clients!: Table<ClientProfile, number>;
  catalogItems!: Table<CatalogItem, number>;
  serviceOrders!: Table<ServiceOrder, number>;
  restaurantTables!: Table<RestaurantTableAccount, string>;
  staffUsers!: Table<StaffUser, string>;
  auditLogs!: Table<AuditLogEntry, number>;
  promoCodes!: Table<DiscountPromoCode, string>;
  cashShifts!: Table<CashShift, number>;

  constructor() {
    super('BridgePOS_ERP_DB');

    this.version(1).stores({
      corporateConfig: 'id, rnc',
      brands: 'id, name',
      ncfSequences: 'type, authorizationNo, direction, isActive',
      documents:
        '++id, documentCode, brandId, isFiscal, ncfType, goesTo607, createdAt, syncStatus',
    });

    this.version(2).stores({
      corporateConfig: 'id, rnc',
      brands: 'id, name',
      ncfSequences: 'type, authorizationNo, direction, isActive',
      documents:
        '++id, documentCode, brandId, isFiscal, ncfType, goesTo607, createdAt, syncStatus',
      clients: '++id, name, rncOrCedula, phone, preferredNcfType',
      catalogItems: '++id, brandId, code, name, category, isService, active',
      serviceOrders:
        '++id, orderCode, brandId, status, clientId, clientName, isFiscal, createdAt',
    });

    this.version(3).stores({
      corporateConfig: 'id, rnc',
      brands: 'id, name',
      ncfSequences: 'type, authorizationNo, direction, isActive',
      documents:
        '++id, documentCode, brandId, isFiscal, ncfType, goesTo607, goesTo606, createdAt, syncStatus',
      clients: '++id, name, rncOrCedula, phone, preferredNcfType',
      catalogItems: '++id, brandId, code, name, category, isService, active',
      serviceOrders:
        '++id, orderCode, brandId, status, clientId, clientName, isFiscal, createdAt',
      restaurantTables: 'id, zone, status',
    });

    this.version(4).stores({
      corporateConfig: 'id, rnc',
      brands: 'id, name',
      ncfSequences: 'type, authorizationNo, direction, isActive',
      documents:
        '++id, documentCode, brandId, isFiscal, ncfType, goesTo607, goesTo606, createdAt, syncStatus',
      clients: '++id, name, rncOrCedula, phone, preferredNcfType',
      catalogItems: '++id, brandId, code, name, category, isService, active',
      serviceOrders:
        '++id, orderCode, brandId, status, clientId, clientName, isFiscal, createdAt',
      restaurantTables: 'id, zone, status',
      staffUsers: 'id, role, active',
      auditLogs: '++id, timestamp, userId, userRole, brandId, action',
      promoCodes: 'code, active',
    });

    this.version(5).stores({
      corporateConfig: 'id, rnc',
      brands: 'id, name',
      ncfSequences: 'type, authorizationNo, direction, isActive',
      documents:
        '++id, documentCode, brandId, isFiscal, ncfType, goesTo607, goesTo606, createdAt, syncStatus',
      clients: '++id, name, rncOrCedula, phone, preferredNcfType',
      catalogItems: '++id, brandId, code, name, category, isService, active',
      serviceOrders:
        '++id, orderCode, brandId, status, clientId, clientName, isFiscal, createdAt',
      restaurantTables: 'id, zone, status',
      staffUsers: 'id, role, active',
      auditLogs: '++id, timestamp, userId, userRole, brandId, action',
      promoCodes: 'code, active',
      cashShifts: '++id, brandId, cashierId, status, openedAt, closedAt',
    });

    this.on('populate', async () => {
      await this.corporateConfig.put(INITIAL_CORPORATE_CONFIG);
      await this.brands.bulkPut(INITIAL_BRANDS);
      await this.ncfSequences.bulkPut(INITIAL_NCF_SEQUENCES);
      await this.clients.bulkPut(INITIAL_CLIENTS);
      await this.catalogItems.bulkPut(INITIAL_CATALOG_ITEMS);
      await this.serviceOrders.bulkPut(INITIAL_SERVICE_ORDERS);
      await this.restaurantTables.bulkPut(INITIAL_RESTAURANT_TABLES);
      await this.staffUsers.bulkPut(INITIAL_STAFF_USERS);
      await this.promoCodes.bulkPut(INITIAL_PROMO_CODES);
    });
  }
}

export const db = new BridgePOSDatabase();

export async function logAuditAction(params: {
  user?: StaffUser;
  brandId: BrandId;
  action: string;
  details: string;
}): Promise<void> {
  try {
    const activeId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('bridgepos_active_user_id') || 'user-admin'
        : 'user-admin';
    const userObj =
      params.user ||
      (await db.staffUsers.get(activeId)) ||
      INITIAL_STAFF_USERS[0];

    await db.auditLogs.add({
      timestamp: new Date().toISOString(),
      userId: userObj.id,
      userName: userObj.name,
      userRole: userObj.role,
      brandId: params.brandId,
      action: params.action,
      details: params.details,
    });
  } catch {
    // Silenciar errores no críticos de auditoría
  }
}

/**
 * Garantiza que el Seed Data de Fases 1 y 2 exista
 */
export async function ensureDatabaseSeeded(): Promise<void> {
  const corpCount = await db.corporateConfig.count();
  if (corpCount === 0) {
    await db.corporateConfig.put(INITIAL_CORPORATE_CONFIG);
  }

  const brandCount = await db.brands.count();
  if (brandCount === 0) {
    await db.brands.bulkPut(INITIAL_BRANDS);
  } else if (
    typeof localStorage !== 'undefined' &&
    !localStorage.getItem('bridgepos_seed_v3')
  ) {
    const atelier = await db.brands.get('atelier');
    if (atelier) {
      await db.brands.put({
        ...atelier,
        activeModules: ['SERVICE_MODULE'],
        internalCounter: Math.max(2, atelier.internalCounter || 2),
        quoteCounter: Math.max(2, atelier.quoteCounter || 2),
      });
    }
    const bt = await db.brands.get('bridge-tech');
    if (bt) {
      await db.brands.put({
        ...bt,
        internalCounter: Math.max(2, bt.internalCounter || 2),
        quoteCounter: Math.max(2, bt.quoteCounter || 2),
      });
    }
    const sb = await db.brands.get('sb-mantenimiento');
    if (sb) {
      await db.brands.put({
        ...sb,
        internalCounter: Math.max(2, sb.internalCounter || 2),
        quoteCounter: Math.max(2, sb.quoteCounter || 2),
      });
    }
    localStorage.setItem('bridgepos_seed_v3', 'true');
  }

  const ncfCount = await db.ncfSequences.count();
  if (ncfCount === 0) {
    await db.ncfSequences.bulkPut(INITIAL_NCF_SEQUENCES);
  }

  const clientCount = await db.clients.count();
  if (clientCount === 0) {
    await db.clients.bulkPut(INITIAL_CLIENTS);
  }

  const catalogCount = await db.catalogItems.count();
  if (catalogCount === 0) {
    await db.catalogItems.bulkPut(INITIAL_CATALOG_ITEMS);
  } else if (catalogCount < INITIAL_CATALOG_ITEMS.length) {
    const existingCodes = new Set(
      (await db.catalogItems.toArray()).map((i) => i.code)
    );
    const missing = INITIAL_CATALOG_ITEMS.filter(
      (i) => !existingCodes.has(i.code)
    );
    if (missing.length > 0) {
      await db.catalogItems.bulkAdd(missing);
    }
  }

  const ordersCount = await db.serviceOrders.count();
  if (ordersCount === 0) {
    await db.serviceOrders.bulkPut(INITIAL_SERVICE_ORDERS);
  }

  const tablesCount = await db.restaurantTables.count();
  if (tablesCount === 0) {
    await db.restaurantTables.bulkPut(INITIAL_RESTAURANT_TABLES);
  }

  const usersCount = await db.staffUsers.count();
  if (usersCount === 0) {
    await db.staffUsers.bulkPut(INITIAL_STAFF_USERS);
  }

  const promosCount = await db.promoCodes.count();
  if (promosCount === 0) {
    await db.promoCodes.bulkPut(INITIAL_PROMO_CODES);
  }
}

export async function resetToOfficialSeedData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.corporateConfig, db.brands, db.ncfSequences],
    async () => {
      await db.corporateConfig.put({
        ...INITIAL_CORPORATE_CONFIG,
        updatedAt: new Date().toISOString(),
      });
      await db.brands.bulkPut(INITIAL_BRANDS);
      await db.ncfSequences.bulkPut(
        INITIAL_NCF_SEQUENCES.map((seq) => ({
          ...seq,
          updatedAt: new Date().toISOString(),
        }))
      );
    }
  );
}
