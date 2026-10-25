import {
  db,
  INITIAL_CORPORATE_CONFIG,
  type BrandId,
  type BrandProfile,
  type CorporateConfig,
  type InternalDocType,
  type InvoiceItem,
  type IssuedDocument,
  type ModuleType,
  type NCFSequence,
  type NCFType,
  type PaymentMethod,
} from '../db/db';

// ==========================================
// 1. CONSTANTES NORMATIVA DGII (REPÚBLICA DOMINICANA)
// ==========================================

export const DGII_ITBIS_RATE = 0.18; // 18% ITBIS general RD
export const DGII_LEGAL_TIP_RATE = 0.10; // 10% Propina Legal (Ley 54-32 RD)

export type B11RetentionCategory =
  | 'SERVICIO_PROFESIONAL_10' // 10% ISR + 100% ITBIS
  | 'SERVICIO_TECNICO_2'      // 2% ISR + 100% ITBIS (Mantenimiento, costura, técnicos)
  | 'COMPRA_BIENES_GRAVADOS'  // 0% ISR + 100% ITBIS (Norma 05-2019 compras informales)
  | 'COMPRA_BIENES_EXENTOS';  // 0% ISR + 0% ITBIS

export interface FiscalCalculationOptions {
  isFiscal: boolean;
  includeLegalTip?: boolean; // 10% Propina Legal RD (Restaurante)
  pricesIncludeItbis?: boolean; // Si el precio base ya tiene el 18% incluido
  depositPercentage?: number; // Ej. 50% de abono inicial en SERVICE_MODULE
  globalDiscount?: number; // Descuento global o cupón promocional en RD$
  forceZeroTaxes?: boolean; // Modo Cobrar Sin Impuestos (0% ITBIS y 0% Propina)
}

export interface FiscalCalculationResult {
  isFiscal: boolean;
  grossSubtotal: number;
  discountTotal: number;
  netSubtotal: number;
  taxableBase: number;
  exemptAmount: number;
  itbisAmount: number; // 0 cuando isFiscal === false
  showItbisBreakdown: boolean; // false cuando isFiscal === false
  legalTipAmount: number; // 10% sobre netSubtotal si aplica
  totalAmount: number;
  depositPercentage: number;
  amountToPayNow: number;
  balanceDue: number;
  goesTo607: boolean;
}

export interface B11RetentionResult {
  category: B11RetentionCategory;
  grossAmount: number;
  invoicedItbis: number; // 18% ITBIS facturado
  retainedItbis: number; // 100% del ITBIS retenido según Norma 05-2019
  isrRetentionRate: number; // 0.10, 0.02 o 0
  retainedIsr: number; // ISR retenido
  totalRetained: number;
  netPayableToSupplier: number; // Monto neto a desembolsar al proveedor informal
}

export interface DocumentHeaderMetadata {
  isFiscal: boolean;
  // Datos de la marca operativa (siempre visibles)
  brandId: BrandId;
  brandName: string;
  brandSubtitle: string;
  brandLogoUrl: string;
  brandPhone: string;
  // Datos Fiscales (SOLO presentes cuando isFiscal === true)
  corporateLegalName: string | null; // 'Bridge to Solutions, S.R.L.' o null
  corporateRnc: string | null; // '133494442' o null
  regMercantil: string | null; // '856888' o null
  documentTitle: string; // Ej. 'FACTURA DE CRÉDITO FISCAL' vs 'ORDEN DE SERVICIO'
  documentNumber: string; // Ej. 'B0100000001' vs 'ORD-0001'
  authorizationNo: string | null; // Ej. '5005602888' o null
  expirationDate: string | null; // Ej. '31/12/2027' o null
  showItbisBreakdown: boolean;
  goesTo607: boolean;
}

// ==========================================
// 2. FORMATEO Y VALIDACIÓN DE SECUENCIAS NCF
// ==========================================

/**
 * Formatea una secuencia NCF estándar DGII Serie B (11 caracteres: 3 letras/serie + 8 dígitos)
 * Ejemplo: formatNCF('B01', 1) -> 'B0100000001'
 */
export function formatNCF(type: NCFType, sequenceNumber: number): string {
  const padded = String(Math.max(1, Math.floor(sequenceNumber))).padStart(8, '0');
  return `${type}${padded}`;
}

/**
 * Formatea la numeración interna no fiscal
 * Ejemplo: formatInternalCode('ORD', 1) -> 'ORD-0001'
 */
export function formatInternalCode(prefix: string, sequenceNumber: number): string {
  const cleanPrefix = (prefix || 'ORD').trim().toUpperCase();
  const padded = String(Math.max(1, Math.floor(sequenceNumber))).padStart(4, '0');
  return `${cleanPrefix}-${padded}`;
}

/**
 * Verifica si una fecha en formato DD/MM/YYYY está vencida respecto al día de hoy
 */
export function isNCFExpired(expirationDate: string): boolean {
  if (!expirationDate || expirationDate.toUpperCase() === 'N/A') {
    return false;
  }
  const parts = expirationDate.split('/');
  if (parts.length !== 3) return false;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  const exp = new Date(year, month, day, 23, 59, 59, 999);
  return new Date().getTime() > exp.getTime();
}

/**
 * Calcula métricas de disponibilidad de un bloque de NCF
 */
export function getNCFSequenceStatus(seq: NCFSequence) {
  const totalApproved = seq.limitNumber - seq.startNumber + 1;
  const usedCount = Math.max(0, seq.currentNumber - seq.startNumber);
  const remaining = Math.max(0, seq.limitNumber - seq.currentNumber + 1);
  const isExhausted = seq.currentNumber > seq.limitNumber;
  const expired = isNCFExpired(seq.expirationDate);
  const nextFormatted = isExhausted
    ? 'AGOTADO'
    : formatNCF(seq.type, seq.currentNumber);
  const usagePercent =
    totalApproved > 0
      ? Math.min(100, Math.round((usedCount / totalApproved) * 100))
      : 100;

  let alertLevel: 'OK' | 'WARNING' | 'EXHAUSTED' | 'EXPIRED' = 'OK';
  if (expired) {
    alertLevel = 'EXPIRED';
  } else if (isExhausted || remaining === 0) {
    alertLevel = 'EXHAUSTED';
  } else if (remaining <= seq.warningThreshold) {
    alertLevel = 'WARNING';
  }

  return {
    totalApproved,
    usedCount,
    remaining,
    isExhausted,
    expired,
    nextFormatted,
    usagePercent,
    alertLevel,
  };
}

// ==========================================
// 3. MOTOR DE CÁLCULO FISCAL DUAL (ITBIS 18% + PROPINA 10%)
// ==========================================

/**
 * Redondeo financiero a 2 decimales estándar DGII
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula los totales de una transacción respetando estrictamente el Modo Fiscal Dual:
 * - isFiscal = false: NO desglosa ITBIS (itbisAmount = 0), NO va al 607.
 * - isFiscal = true: Desglosa 18% ITBIS en ítems gravados y marca goesTo607 = true.
 */
export function calculateInvoiceTotals(
  items: InvoiceItem[],
  options: FiscalCalculationOptions
): FiscalCalculationResult {
  const {
    isFiscal,
    includeLegalTip = false,
    pricesIncludeItbis = false,
    depositPercentage = 100,
    globalDiscount = 0,
    forceZeroTaxes = false,
  } = options;

  let grossSubtotal = 0;
  let lineDiscountSum = 0;
  let taxableLinesNet = 0;
  let exemptLinesNet = 0;

  for (const item of items) {
    if (item.isCourtesy) {
      continue;
    }
    const extrasUnitSum = (item.extras || []).reduce(
      (acc, ex) => acc + (Number(ex.price) || 0),
      0
    );
    const effectiveUnitPrice = roundCurrency(item.unitPrice + extrasUnitSum);
    const lineGross = roundCurrency(item.quantity * effectiveUnitPrice);
    const lineDiscount = roundCurrency(item.discount || 0);
    const lineNet = Math.max(0, roundCurrency(lineGross - lineDiscount));

    grossSubtotal = roundCurrency(grossSubtotal + lineGross);
    lineDiscountSum = roundCurrency(lineDiscountSum + lineDiscount);

    if (!isFiscal || forceZeroTaxes || item.taxExempt) {
      exemptLinesNet = roundCurrency(exemptLinesNet + lineNet);
    } else {
      taxableLinesNet = roundCurrency(taxableLinesNet + lineNet);
    }
  }

  const extraGlobalDiscount = Math.max(0, roundCurrency(globalDiscount));
  const discountTotal = Math.min(
    grossSubtotal,
    roundCurrency(lineDiscountSum + extraGlobalDiscount)
  );

  // Aplicar descuento global proporcionalmente sobre la base gravada y exenta
  const rawNetBeforeGlobal = roundCurrency(taxableLinesNet + exemptLinesNet);
  let taxableBase = 0;
  let exemptAmount = 0;
  let itbisAmount = 0;

  if (rawNetBeforeGlobal > 0) {
    const netAfterGlobal = Math.max(
      0,
      roundCurrency(rawNetBeforeGlobal - extraGlobalDiscount)
    );
    const ratio = netAfterGlobal / rawNetBeforeGlobal;
    const discountedTaxable = roundCurrency(taxableLinesNet * ratio);
    exemptAmount = roundCurrency(netAfterGlobal - discountedTaxable);

    if (!isFiscal || forceZeroTaxes) {
      taxableBase = 0;
      itbisAmount = 0;
      exemptAmount = netAfterGlobal;
    } else if (pricesIncludeItbis) {
      taxableBase = roundCurrency(discountedTaxable / (1 + DGII_ITBIS_RATE));
      itbisAmount = roundCurrency(discountedTaxable - taxableBase);
    } else {
      taxableBase = discountedTaxable;
      itbisAmount = roundCurrency(taxableBase * DGII_ITBIS_RATE);
    }
  }

  const netSubtotal = roundCurrency(taxableBase + exemptAmount);

  // Propina Legal RD (10%) se calcula sobre el subtotal neto antes de ITBIS
  const legalTipAmount =
    includeLegalTip && !forceZeroTaxes
      ? roundCurrency(netSubtotal * DGII_LEGAL_TIP_RATE)
      : 0;

  const totalAmount = roundCurrency(netSubtotal + itbisAmount + legalTipAmount);

  const clampedDeposit = Math.min(100, Math.max(0, depositPercentage));
  const amountToPayNow = roundCurrency(totalAmount * (clampedDeposit / 100));
  const balanceDue = roundCurrency(totalAmount - amountToPayNow);

  return {
    isFiscal,
    grossSubtotal,
    discountTotal,
    netSubtotal,
    taxableBase,
    exemptAmount,
    itbisAmount: isFiscal && !forceZeroTaxes ? itbisAmount : 0,
    showItbisBreakdown: isFiscal && !forceZeroTaxes,
    legalTipAmount,
    totalAmount,
    depositPercentage: clampedDeposit,
    amountToPayNow,
    balanceDue,
    goesTo607: isFiscal,
  };
}

// ==========================================
// 4. CÁLCULO DE RETENCIONES B11 (COMPRAS INFORMALES DGII)
// ==========================================

/**
 * Calcula las retenciones de ITBIS e ISR para Comprobantes de Compras (B11)
 * según Norma General DGII 05-2019 y Art. 309 del Código Tributario RD.
 */
export function calculateB11Retentions(
  grossAmount: number,
  category: B11RetentionCategory
): B11RetentionResult {
  const cleanGross = Math.max(0, roundCurrency(grossAmount));

  let invoicedItbis = 0;
  let retainedItbis = 0;
  let isrRetentionRate = 0;

  switch (category) {
    case 'SERVICIO_PROFESIONAL_10':
      invoicedItbis = roundCurrency(cleanGross * DGII_ITBIS_RATE);
      retainedItbis = invoicedItbis; // 100% ITBIS retenido (Norma 05-2019)
      isrRetentionRate = 0.10; // 10% ISR honorarios profesionales
      break;

    case 'SERVICIO_TECNICO_2':
      invoicedItbis = roundCurrency(cleanGross * DGII_ITBIS_RATE);
      retainedItbis = invoicedItbis; // 100% ITBIS retenido
      isrRetentionRate = 0.02; // 2% ISR servicios técnicos / oficios no profesionales
      break;

    case 'COMPRA_BIENES_GRAVADOS':
      invoicedItbis = roundCurrency(cleanGross * DGII_ITBIS_RATE);
      retainedItbis = invoicedItbis; // 100% ITBIS retenido en bienes gravados
      isrRetentionRate = 0;
      break;

    case 'COMPRA_BIENES_EXENTOS':
      invoicedItbis = 0;
      retainedItbis = 0;
      isrRetentionRate = 0;
      break;
  }

  const retainedIsr = roundCurrency(cleanGross * isrRetentionRate);
  const totalRetained = roundCurrency(retainedItbis + retainedIsr);
  // El proveedor recibe el subtotal menos el ISR retenido (ya que el 100% del ITBIS es retenido por Bridge to Solutions)
  const netPayableToSupplier = roundCurrency(cleanGross + invoicedItbis - totalRetained);

  return {
    category,
    grossAmount: cleanGross,
    invoicedItbis,
    retainedItbis,
    isrRetentionRate,
    retainedIsr,
    totalRetained,
    netPayableToSupplier,
  };
}

// ==========================================
// 5. GENERADOR DE ENCABEZADO MODO DUAL (INTERNO VS FISCAL)
// ==========================================

/**
 * Construye los metadatos de impresión/visualización de factura o recibo
 * garantizando que en Modo Interno (`isFiscal: false`) NUNCA se exponga
 * el RNC 133494442 ni "Bridge to Solutions, S.R.L." ni NCF ni desglose de ITBIS.
 */
export function buildDocumentHeaderMetadata(params: {
  isFiscal: boolean;
  brand: BrandProfile;
  corporate?: CorporateConfig;
  ncfSequence?: NCFSequence;
  consumedCode?: string;
  internalDocTitle?: InternalDocType;
}): DocumentHeaderMetadata {
  const {
    isFiscal,
    brand,
    corporate = INITIAL_CORPORATE_CONFIG,
    ncfSequence,
    consumedCode,
    internalDocTitle,
  } = params;

  if (!isFiscal) {
    // MODO INTERNO (isFiscal: false)
    // PROHIBIDO mostrar RNC 133494442, razón social "Bridge to Solutions, S.R.L.", NCF o ITBIS
    const titleChoice = internalDocTitle || brand.defaultInternalDocTitle;
    const titleMap: Record<InternalDocType, string> = {
      COTIZACION: 'COTIZACIÓN',
      ORDEN_DE_SERVICIO: 'ORDEN DE SERVICIO',
      RECIBO_DE_ABONO: 'RECIBO DE ABONO',
      RECIBO_DE_PAGO: 'RECIBO DE PAGO',
    };
    const readableTitle = titleMap[titleChoice] || 'ORDEN DE SERVICIO';

    return {
      isFiscal: false,
      brandId: brand.id,
      brandName: brand.name,
      brandSubtitle: brand.subtitle,
      brandLogoUrl: brand.logoUrl,
      brandPhone: brand.phone,
      corporateLegalName: null,
      corporateRnc: null,
      regMercantil: null,
      documentTitle: readableTitle,
      documentNumber:
        consumedCode || formatInternalCode(brand.internalPrefix, brand.internalCounter),
      authorizationNo: null,
      expirationDate: null,
      showItbisBreakdown: false,
      goesTo607: false,
    };
  }

  // MODO FISCAL (isFiscal: true)
  // Encabezado fiscal obligatorio: Bridge to Solutions, S.R.L. | RNC: 133494442
  const seq = ncfSequence;
  const ncfFormatted =
    consumedCode || (seq ? formatNCF(seq.type, seq.currentNumber) : 'B0200000001');

  return {
    isFiscal: true,
    brandId: brand.id,
    brandName: brand.name,
    brandSubtitle: brand.subtitle,
    brandLogoUrl: brand.logoUrl,
    brandPhone: brand.phone,
    corporateLegalName: corporate.legalName, // Bridge to Solutions, S.R.L.
    corporateRnc: corporate.rnc, // 133494442
    regMercantil: corporate.regMercantil, // 856888
    documentTitle: seq ? seq.name.toUpperCase() : 'FACTURA DE CONSUMO',
    documentNumber: ncfFormatted,
    authorizationNo: seq ? seq.authorizationNo : '5005602887',
    expirationDate: seq ? seq.expirationDate : 'N/A',
    showItbisBreakdown: true,
    goesTo607: seq ? seq.direction === 'VENTA_607' : true,
  };
}

// ==========================================
// 6. CONSUMO TRANSACCIONAL SEGURO DE NCF Y NUMERACIÓN INTERNA
// ==========================================

/**
 * Consume de manera atómica en IndexedDB (Dexie) el siguiente NCF disponible
 * de la serie indicada (`B01`, `B02`, `B04`, `B11`, `B13`).
 */
export async function consumeNextNCF(type: NCFType): Promise<{
  ncf: string;
  authorizationNo: string;
  expirationDate: string;
  sequence: NCFSequence;
}> {
  return await db.transaction('rw', db.ncfSequences, async () => {
    const seq = await db.ncfSequences.get(type);
    if (!seq) {
      throw new Error(`La secuencia fiscal ${type} no existe en la base de datos.`);
    }

    if (!seq.isActive) {
      throw new Error(`La secuencia fiscal ${type} está desactivada.`);
    }

    if (isNCFExpired(seq.expirationDate)) {
      throw new Error(
        `La secuencia ${type} (Aut. ${seq.authorizationNo}) venció el ${seq.expirationDate}.`
      );
    }

    if (seq.currentNumber > seq.limitNumber) {
      throw new Error(
        `Secuencia ${type} AGOTADA. Se alcanzó el límite autorizado (${seq.rangeEndFormatted}). Solicite nueva secuencia a la DGII.`
      );
    }

    const allocatedNumber = seq.currentNumber;
    const formattedNCF = formatNCF(seq.type, allocatedNumber);

    const updatedSeq: NCFSequence = {
      ...seq,
      currentNumber: allocatedNumber + 1,
      updatedAt: new Date().toISOString(),
    };

    await db.ncfSequences.put(updatedSeq);

    return {
      ncf: formattedNCF,
      authorizationNo: seq.authorizationNo,
      expirationDate: seq.expirationDate,
      sequence: updatedSeq,
    };
  });
}

/**
 * Consume de manera atómica el siguiente número interno (`ORD-0001`) de la marca activa
 * sin tocar ninguna secuencia NCF de la DGII.
 */
export async function consumeNextInternalNumber(brandId: BrandId): Promise<{
  internalCode: string;
  brand: BrandProfile;
}> {
  return await db.transaction('rw', db.brands, async () => {
    const brand = await db.brands.get(brandId);
    if (!brand) {
      throw new Error(`Marca ${brandId} no encontrada.`);
    }

    const allocated = brand.internalCounter || 1;
    const internalCode = formatInternalCode(brand.internalPrefix, allocated);

    const updatedBrand: BrandProfile = {
      ...brand,
      internalCounter: allocated + 1,
    };

    await db.brands.put(updatedBrand);

    return {
      internalCode,
      brand: updatedBrand,
    };
  });
}

/**
 * Consume de manera atómica el siguiente número de cotización (`QUOTE-0001`)
 */
export async function consumeNextQuoteNumber(brandId: BrandId): Promise<{
  quoteCode: string;
  brand: BrandProfile;
}> {
  return await db.transaction('rw', db.brands, async () => {
    const brand = await db.brands.get(brandId);
    if (!brand) {
      throw new Error(`Marca ${brandId} no encontrada.`);
    }

    const allocated = brand.quoteCounter || 1;
    const quoteCode = formatInternalCode('QUOTE', allocated);

    const updatedBrand: BrandProfile = {
      ...brand,
      quoteCounter: allocated + 1,
    };

    await db.brands.put(updatedBrand);

    return {
      quoteCode,
      brand: updatedBrand,
    };
  });
}

/**
 * Construye el enlace directo de WhatsApp (wa.me) con formato de teléfono RD (+1 809/829/849)
 */
export function buildWhatsAppShareUrl(params: {
  phone: string;
  brandName: string;
  documentTitle: string;
  documentCode: string;
  clientName: string;
  itemsSummary: string[];
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
}): string {
  const digits = (params.phone || '').replace(/\D/g, '');
  let normalizedPhone = digits;
  if (digits.length === 10 && /^(809|829|849)/.test(digits)) {
    normalizedPhone = `1${digits}`;
  } else if (digits.length === 0) {
    normalizedPhone = '18297810716';
  }

  const lines = [
    `*${params.brandName}*`,
    `📄 *${params.documentTitle}:* ${params.documentCode}`,
    `👤 *Cliente:* ${params.clientName}`,
    '',
    '*Detalle:*',
    ...params.itemsSummary.map((line) => `• ${line}`),
    '',
    `💰 *Total Acordado:* RD$ ${params.totalAmount.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
    })}`,
    `✅ *Total Abonado:* RD$ ${params.amountPaid.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
    })}`,
    `📌 *Balance Pendiente:* RD$ ${params.balanceDue.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
    })}`,
  ];

  const encoded = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${normalizedPhone}?text=${encoded}`;
}

/**
 * Emite y guarda un documento completo (Fiscal o Interno) en Dexie en una sola transacción ACID
 */
export async function issueDocumentTransaction(params: {
  brandId: BrandId;
  moduleUsed: ModuleType;
  isFiscal: boolean;
  ncfType?: NCFType;
  modifiedNcf?: string;
  internalDocTitle?: InternalDocType;
  customerName: string;
  customerRncOrCedula?: string;
  customerPhone?: string;
  paymentMethod?: PaymentMethod;
  items: InvoiceItem[];
  includeLegalTip?: boolean;
  depositPercentage?: number;
  globalDiscount?: number;
  forceZeroTaxes?: boolean;
}): Promise<IssuedDocument> {
  return await db.transaction(
    'rw',
    [db.brands, db.ncfSequences, db.documents],
    async () => {
      const brand = await db.brands.get(params.brandId);
      if (!brand) {
        throw new Error(`Marca ${params.brandId} no encontrada.`);
      }

      const totals = calculateInvoiceTotals(params.items, {
        isFiscal: params.isFiscal,
        includeLegalTip: params.includeLegalTip,
        depositPercentage: params.depositPercentage ?? 100,
        globalDiscount: params.globalDiscount ?? 0,
        forceZeroTaxes: params.forceZeroTaxes ?? false,
      });

      let documentCode = '';
      let authorizationNo: string | undefined;
      let expirationDate: string | undefined;
      let ncfTypeUsed: NCFType | undefined;
      let goesTo607 = false;
      let goesTo606 = false;

      if (params.isFiscal) {
        const targetNcfType = params.ncfType || 'B02';
        const consumed = await consumeNextNCF(targetNcfType);
        documentCode = consumed.ncf;
        authorizationNo = consumed.authorizationNo;
        expirationDate = consumed.expirationDate;
        ncfTypeUsed = targetNcfType;
        goesTo607 = consumed.sequence.direction === 'VENTA_607';
        goesTo606 = consumed.sequence.direction === 'COMPRA_606_GASTO';
      } else {
        const internal = await consumeNextInternalNumber(params.brandId);
        documentCode = internal.internalCode;
        goesTo607 = false;
        goesTo606 = false;
      }

      const newDoc: IssuedDocument = {
        documentCode,
        brandId: brand.id,
        brandName: brand.name,
        moduleUsed: params.moduleUsed,
        isFiscal: params.isFiscal,
        ncfType: ncfTypeUsed,
        ncfNumber: params.isFiscal ? documentCode : undefined,
        modifiedNcf: params.modifiedNcf,
        authorizationNo,
        expirationDate,
        internalDocTitle: !params.isFiscal
          ? params.internalDocTitle || brand.defaultInternalDocTitle
          : undefined,
        customerName: params.customerName || 'Consumidor Final',
        customerRncOrCedula: params.customerRncOrCedula,
        customerPhone: params.customerPhone,
        paymentMethod: params.paymentMethod,
        items: params.items,
        subtotal: totals.netSubtotal,
        discountTotal: totals.discountTotal,
        taxableAmount: totals.taxableBase,
        itbisAmount: totals.itbisAmount,
        legalTipAmount: totals.legalTipAmount,
        totalAmount: totals.totalAmount,
        amountPaid: totals.amountToPayNow,
        balanceDue: totals.balanceDue,
        goesTo607,
        goesTo606,
        createdAt: new Date().toISOString(),
        syncStatus: 'LOCAL_ONLY',
      };

      const id = await db.documents.add(newDoc);
      return { ...newDoc, id };
    }
  );
}
