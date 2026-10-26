import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Barcode,
  Calculator,
  Check,
  CreditCard,
  History,
  Lock,
  Minus,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  Unlock,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import {
  db,
  INITIAL_PROMO_CODES,
  INITIAL_STAFF_USERS,
  logAuditAction,
  type BrandProfile,
  type CatalogItem,
  type ClientProfile,
  type CorporateConfig,
  type InvoiceItem,
  type IssuedDocument,
  type NCFSequence,
  type PaymentMethod,
} from '../db/db';
import {
  calculateInvoiceTotals,
  issueDocumentTransaction,
  roundCurrency,
} from '../services/fiscalService';
import {
  InvoicePrintModal,
  type PrintableDocumentData,
} from '../components/InvoicePrintModal';

interface RetailPOSViewProps {
  activeBrand: BrandProfile;
  corporate: CorporateConfig;
  ncfSequences: NCFSequence[];
  catalogItems: CatalogItem[];
  clients: ClientProfile[];
}

export const RetailPOSView: React.FC<RetailPOSViewProps> = ({
  activeBrand,
  corporate,
  ncfSequences,
  catalogItems,
  clients,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<InvoiceItem[]>([]);
  const [expandedCartItemId, setExpandedCartItemId] = useState<string | null>(
    null
  );
  const [allowPriceOverride, setAllowPriceOverride] = useState<boolean>(false);

  // Descuento y Código Promocional en POS
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string>('');
  const [globalDiscountType, setGlobalDiscountType] = useState<
    'PERCENT' | 'FIXED'
  >('PERCENT');
  const [globalDiscountVal, setGlobalDiscountVal] = useState<number>(0);

  const promoCodes =
    useLiveQuery(() => db.promoCodes.toArray(), []) ?? INITIAL_PROMO_CODES;

  // Datos de cobro y modo fiscal
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('Consumidor Final');
  const [customerRnc, setCustomerRnc] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('EFECTIVO');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [isFiscal, setIsFiscal] = useState<boolean>(false);
  const [ncfType, setNcfType] = useState<'B01' | 'B02'>('B02');

  // Modal de Creación Rápida de Cliente
  const [newClientModalOpen, setNewClientModalOpen] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientRnc, setNewClientRnc] = useState<string>('');
  const [newClientPhone, setNewClientPhone] = useState<string>('');
  const [newClientPrefNcf, setNewClientPrefNcf] = useState<'B01' | 'B02'>(
    'B01'
  );

  const [toast, setToast] = useState<string | null>(null);
  const [printData, setPrintData] = useState<PrintableDocumentData | null>(
    null
  );

  // Drawer Móvil del Carrito y Modal de Corte de Caja (X / Z)
  const [mobileCartDrawerOpen, setMobileCartDrawerOpen] =
    useState<boolean>(false);
  const [cashShiftModalOpen, setCashShiftModalOpen] = useState<boolean>(false);
  const [shiftInitialCash, setShiftInitialCash] = useState<string>('2000');
  const [shiftCountedCash, setShiftCountedCash] = useState<string>('');
  const [shiftNotes, setShiftNotes] = useState<string>('');

  const staffUsers =
    useLiveQuery(() => db.staffUsers.toArray(), []) ?? INITIAL_STAFF_USERS;

  // Todas las ventas emitidas hoy para esta marca (para Cuadre de Caja X / Z)
  const todayBrandDocuments =
    useLiveQuery(
      () => db.documents.where('brandId').equals(activeBrand.id).toArray(),
      [activeBrand.id]
    ) ?? [];

  const shiftSummary = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayDocs = todayBrandDocuments.filter(
      (d) => new Date(d.createdAt).getTime() >= startOfToday.getTime()
    );

    let totalCash = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let totalCreditNotes = 0;
    let txCount = 0;

    for (const d of todayDocs) {
      if (d.goesTo606) continue;
      const isB04 = d.ncfType === 'B04' || Boolean(d.modifiedNcf);
      const amt = d.amountPaid + (d.voluntaryTipAmount || 0);
      if (isB04) {
        totalCreditNotes = roundCurrency(totalCreditNotes + amt);
        if (d.paymentMethod === 'EFECTIVO') {
          totalCash = roundCurrency(totalCash - amt);
        } else if (d.paymentMethod === 'TARJETA') {
          totalCard = roundCurrency(totalCard - amt);
        } else {
          totalTransfer = roundCurrency(totalTransfer - amt);
        }
      } else {
        txCount += 1;
        if (d.paymentMethod === 'TARJETA') {
          totalCard = roundCurrency(totalCard + amt);
        } else if (d.paymentMethod === 'TRANSFERENCIA') {
          totalTransfer = roundCurrency(totalTransfer + amt);
        } else {
          totalCash = roundCurrency(totalCash + amt);
        }
      }
    }

    const totalSales = roundCurrency(totalCash + totalCard + totalTransfer);
    const initialNum = Math.max(0, Number(shiftInitialCash) || 0);
    const expectedDrawerCash = roundCurrency(initialNum + totalCash);
    const countedNum =
      shiftCountedCash.trim() === ''
        ? expectedDrawerCash
        : Math.max(0, Number(shiftCountedCash) || 0);
    const diff = roundCurrency(countedNum - expectedDrawerCash);

    return {
      txCount,
      totalCash,
      totalCard,
      totalTransfer,
      totalCreditNotes,
      totalSales,
      initialNum,
      expectedDrawerCash,
      countedNum,
      diff,
    };
  }, [todayBrandDocuments, shiftInitialCash, shiftCountedCash]);

  const handleCloseShiftAndPrintZ = async (closeShiftType: 'X' | 'Z') => {
    const activeId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('bridgepos_active_user_id') || 'user-admin'
        : 'user-admin';
    const cashier =
      staffUsers.find((u) => u.id === activeId) || INITIAL_STAFF_USERS[0];
    const nowIso = new Date().toISOString();

    const shiftId = await db.cashShifts.add({
      openedAt: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
      closedAt: nowIso,
      cashierId: cashier.id,
      cashierName: cashier.name,
      brandId: activeBrand.id,
      initialCash: shiftSummary.initialNum,
      totalCash: shiftSummary.totalCash,
      totalCard: shiftSummary.totalCard,
      totalTransfer: shiftSummary.totalTransfer,
      totalSales: shiftSummary.totalSales,
      countedCash: shiftSummary.countedNum,
      difference: shiftSummary.diff,
      status: closeShiftType === 'Z' ? 'CLOSED' : 'OPEN',
      notes: shiftNotes.trim() || undefined,
    });

    await logAuditAction({
      user: cashier,
      brandId: activeBrand.id,
      action: closeShiftType === 'Z' ? 'CIERRE_CAJA_Z' : 'CORTE_PARCIAL_X',
      details: `Corte ${closeShiftType} #${shiftId} • Ventas: RD$ ${shiftSummary.totalSales.toLocaleString('es-DO')} • Diferencia Efectivo: RD$ ${shiftSummary.diff.toLocaleString('es-DO')}`,
    });

    const diffLabel =
      shiftSummary.diff === 0
        ? 'CUADRE EXACTO (RD$ 0.00)'
        : shiftSummary.diff > 0
        ? `SOBRANTE EN CAJA: +RD$ ${shiftSummary.diff.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
        : `FALTANTE EN CAJA: RD$ ${shiftSummary.diff.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;

    setCashShiftModalOpen(false);
    setPrintData({
      isFiscal: false,
      brand: activeBrand,
      corporate,
      documentCode: `CORTE-${closeShiftType}-${String(shiftId).padStart(4, '0')}`,
      customTitle:
        closeShiftType === 'Z'
          ? 'CIERRE DE CAJA DEL TURNO (CORTE Z)'
          : 'ARQUEO PARCIAL DE CAJA (CORTE X)',
      defaultFormat: 'THERMAL_80MM',
      clientName: `Cajero: ${cashier.name} (${cashier.role})`,
      createdAt: nowIso,
      items: [
        {
          id: 'z-1',
          description: 'Fondo Inicial de Caja (Apertura)',
          quantity: 1,
          unit: 'TURNO',
          unitPrice: shiftSummary.initialNum,
        },
        {
          id: 'z-2',
          description: 'Ventas Cobradas en Efectivo',
          quantity: 1,
          unit: 'TURNO',
          unitPrice: shiftSummary.totalCash,
        },
        {
          id: 'z-3',
          description: 'Ventas Cobradas con Tarjeta',
          quantity: 1,
          unit: 'TURNO',
          unitPrice: shiftSummary.totalCard,
        },
        {
          id: 'z-4',
          description: 'Ventas por Transferencia Bancaria',
          quantity: 1,
          unit: 'TURNO',
          unitPrice: shiftSummary.totalTransfer,
        },
      ],
      subtotal: shiftSummary.totalSales,
      itbisAmount: 0,
      totalAmount: shiftSummary.totalSales,
      amountPaid: shiftSummary.countedNum,
      balanceDue: 0,
      notes: `Efectivo Esperado en Gaveta: RD$ ${shiftSummary.expectedDrawerCash.toLocaleString('es-DO', { minimumFractionDigits: 2 })} | Efectivo Contado: RD$ ${shiftSummary.countedNum.toLocaleString('es-DO', { minimumFractionDigits: 2 })} | ${diffLabel}${
        shiftNotes.trim() ? ` | Obs: ${shiftNotes.trim()}` : ''
      }`,
    });

    showToast(
      `Corte ${closeShiftType} registrado y listo para imprimir en 80mm.`
    );
  };

  // Historial reciente de ventas del POS en tiempo real
  const recentSales =
    useLiveQuery(
      () =>
        db.documents
          .where('brandId')
          .equals(activeBrand.id)
          .reverse()
          .limit(8)
          .toArray(),
      [activeBrand.id]
    ) ?? [];

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Productos de la unidad de negocio activa
  const brandProducts = catalogItems.filter(
    (item) => item.brandId === activeBrand.id && item.active
  );

  const categories = [
    'ALL',
    ...Array.from(new Set(brandProducts.map((p) => p.category))),
  ];

  const filteredProducts = brandProducts.filter((item) => {
    const matchesCat =
      selectedCategory === 'ALL' || item.category === selectedCategory;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  // Agregar ítem al carrito con control de stock en tiempo real
  const handleAddToCart = (product: CatalogItem) => {
    const existing = cart.find((c) => c.code === product.code);
    const currentQtyInCart = existing ? existing.quantity : 0;

    if (
      !product.isService &&
      typeof product.stock === 'number' &&
      currentQtyInCart + 1 > product.stock
    ) {
      showToast(
        `Stock insuficiente para ${product.name} (${product.stock} ${product.unit} disp.)`
      );
      return;
    }

    if (existing) {
      setCart((prev) =>
        prev.map((c) =>
          c.code === product.code ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          id: `${product.code}-${Date.now()}`,
          code: product.code,
          description: product.name,
          quantity: 1,
          unit: product.unit || 'UND',
          unitPrice: product.price,
          discount: 0,
          notes: '',
        },
      ]);
    }
  };

  // Escaneo rápido por código de barras al presionar Enter
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      const q = searchQuery.trim().toLowerCase();
      const exactMatch =
        brandProducts.find((p) => p.code.toLowerCase() === q) ||
        filteredProducts[0];
      if (exactMatch) {
        handleAddToCart(exactMatch);
        setSearchQuery('');
      }
    }
  };

  const handleUpdateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;

          const catalogMatch = brandProducts.find((p) => p.code === item.code);
          if (
            catalogMatch &&
            !catalogMatch.isService &&
            typeof catalogMatch.stock === 'number' &&
            nextQty > catalogMatch.stock
          ) {
            showToast(
              `Máximo disponible en stock: ${catalogMatch.stock} ${catalogMatch.unit}`
            );
            return item;
          }

          return { ...item, quantity: nextQty };
        })
        .filter((x): x is InvoiceItem => x !== null)
    );
  };

  const handleUpdateItemField = (
    id: string,
    field: 'unitPrice' | 'discount' | 'notes',
    value: number | string
  ) => {
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectClient = (clientIdStr: string) => {
    setSelectedClientId(clientIdStr);
    if (!clientIdStr) {
      setCustomerName('Consumidor Final');
      setCustomerRnc('');
      setCustomerPhone('');
      return;
    }
    const found = clients.find((c) => String(c.id) === clientIdStr);
    if (found) {
      setCustomerName(found.name);
      setCustomerRnc(found.rncOrCedula);
      setCustomerPhone(found.phone);
      setNcfType(found.preferredNcfType);
    }
  };

  // Crear cliente rápido desde el POS
  const handleQuickCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;

    const id = await db.clients.add({
      name: newClientName.trim(),
      rncOrCedula: newClientRnc.trim(),
      phone: newClientPhone.trim(),
      preferredNcfType: newClientPrefNcf,
      createdAt: new Date().toISOString(),
    });

    setSelectedClientId(String(id));
    setCustomerName(newClientName.trim());
    setCustomerRnc(newClientRnc.trim());
    setCustomerPhone(newClientPhone.trim());
    setNcfType(newClientPrefNcf);
    setNewClientModalOpen(false);
    setNewClientName('');
    setNewClientRnc('');
    setNewClientPhone('');
    showToast('Cliente creado y seleccionado.');
  };

  const rawCartGross = cart.reduce(
    (acc, item) => acc + roundCurrency(item.quantity * item.unitPrice),
    0
  );

  const computedGlobalDiscount = (() => {
    if (globalDiscountVal <= 0) return 0;
    if (globalDiscountType === 'PERCENT') {
      return roundCurrency(
        rawCartGross * (Math.min(100, globalDiscountVal) / 100)
      );
    }
    return Math.min(rawCartGross, roundCurrency(globalDiscountVal));
  })();

  const handleApplyPromoCode = () => {
    const clean = promoCodeInput.trim().toUpperCase();
    if (!clean) return;
    const found = promoCodes.find(
      (p) => p.code.toUpperCase() === clean && p.active
    );
    if (!found) {
      showToast(`Código promocional "${clean}" inválido o inactivo.`);
      return;
    }
    setGlobalDiscountType(found.type);
    setGlobalDiscountVal(found.value);
    setAppliedPromoCode(found.code);
    showToast(`Código ${found.code} aplicado (${found.description}).`);
  };

  const totals = calculateInvoiceTotals(cart, {
    isFiscal,
    includeLegalTip: false,
    depositPercentage: 100,
    globalDiscount: computedGlobalDiscount,
  });

  const cashReceivedNum = Number(cashTendered) || 0;
  const changeDue =
    paymentMethod === 'EFECTIVO' && cashReceivedNum > totals.totalAmount
      ? roundCurrency(cashReceivedNum - totals.totalAmount)
      : 0;

  // Procesar Venta POS y descontar stock
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      showToast('Agregue al menos un artículo al carrito.');
      return;
    }

    // Validación Fiscal DGII para B01 (Crédito Fiscal exige RNC de 9 dígitos o Cédula de 11 dígitos)
    if (isFiscal && ncfType === 'B01') {
      const cleanDigits = customerRnc.replace(/\D/g, '');
      if (cleanDigits.length !== 9 && cleanDigits.length !== 11) {
        showToast(
          'Para Crédito Fiscal (B01) debe ingresar un RNC (9 dígitos) o Cédula (11 dígitos) válido.'
        );
        return;
      }
    }

    try {
      const emittedDoc = await issueDocumentTransaction({
        brandId: activeBrand.id,
        moduleUsed: 'RETAIL_MODULE',
        isFiscal,
        ncfType: isFiscal ? ncfType : undefined,
        internalDocTitle: 'RECIBO_DE_PAGO',
        customerName: customerName.trim() || 'Consumidor Final',
        customerRncOrCedula: isFiscal ? customerRnc.trim() : undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        items: cart,
        includeLegalTip: false,
        depositPercentage: 100,
        globalDiscount: computedGlobalDiscount,
      });

      await logAuditAction({
        brandId: activeBrand.id,
        action: 'VENTA_POS',
        details: `Comprobante ${emittedDoc.documentCode} • Total RD$ ${emittedDoc.totalAmount}${
          emittedDoc.discountTotal > 0
            ? ` (Desc: RD$ ${emittedDoc.discountTotal}${
                appliedPromoCode ? ` [${appliedPromoCode}]` : ''
              })`
            : ''
        }`,
      });

      // Descontar stock en tiempo real para productos físicos
      for (const line of cart) {
        if (!line.code) continue;
        const prod = brandProducts.find((p) => p.code === line.code);
        if (prod && prod.id && !prod.isService && typeof prod.stock === 'number') {
          await db.catalogItems.update(prod.id, {
            stock: Math.max(0, prod.stock - line.quantity),
          });
        }
      }

      const seqUsed = isFiscal
        ? ncfSequences.find((s) => s.type === ncfType)
        : undefined;

      setPrintData({
        isFiscal: emittedDoc.isFiscal,
        brand: activeBrand,
        corporate,
        ncfSequence: seqUsed,
        documentCode: emittedDoc.documentCode,
        internalDocTitle: 'RECIBO_DE_PAGO',
        authorizationNo: emittedDoc.authorizationNo,
        expirationDate: emittedDoc.expirationDate,
        clientName: emittedDoc.customerName,
        clientRncOrCedula: emittedDoc.customerRncOrCedula,
        clientPhone: customerPhone,
        createdAt: emittedDoc.createdAt,
        items: emittedDoc.items,
        subtotal: emittedDoc.subtotal,
        discountTotal: emittedDoc.discountTotal,
        promoCodeApplied: appliedPromoCode || undefined,
        itbisAmount: emittedDoc.itbisAmount,
        totalAmount: emittedDoc.totalAmount,
        amountPaid: emittedDoc.amountPaid,
        balanceDue: 0,
        payments: [
          {
            id: `pos-${Date.now()}`,
            date: emittedDoc.createdAt,
            amount: emittedDoc.totalAmount,
            method: paymentMethod,
            note: 'Cobro en Punto de Venta',
            receiptCode: emittedDoc.documentCode,
          },
        ],
      });

      setCart([]);
      setCashTendered('');
      setExpandedCartItemId(null);
      setPromoCodeInput('');
      setAppliedPromoCode('');
      setGlobalDiscountVal(0);
      setMobileCartDrawerOpen(false);
      showToast(`Venta completada: ${emittedDoc.documentCode}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al procesar el cobro.';
      showToast(msg);
    }
  };

  // Emitir Nota de Crédito B04 (Anular/Devolver venta y restaurar stock)
  const handleIssueCreditNoteB04 = async (originalDoc: IssuedDocument) => {
    try {
      const emittedB04 = await issueDocumentTransaction({
        brandId: activeBrand.id,
        moduleUsed: 'RETAIL_MODULE',
        isFiscal: originalDoc.isFiscal,
        ncfType: originalDoc.isFiscal ? 'B04' : undefined,
        modifiedNcf: originalDoc.isFiscal
          ? originalDoc.ncfNumber || originalDoc.documentCode
          : originalDoc.documentCode,
        internalDocTitle: 'RECIBO_DE_PAGO',
        customerName: originalDoc.customerName,
        customerRncOrCedula: originalDoc.customerRncOrCedula,
        customerPhone: originalDoc.customerPhone,
        paymentMethod: originalDoc.paymentMethod || 'EFECTIVO',
        items: originalDoc.items,
        includeLegalTip: false,
        depositPercentage: 100,
      });

      // Restaurar stock de los productos devueltos
      for (const line of originalDoc.items) {
        if (!line.code) continue;
        const prod = brandProducts.find((p) => p.code === line.code);
        if (prod && prod.id && !prod.isService && typeof prod.stock === 'number') {
          await db.catalogItems.update(prod.id, {
            stock: prod.stock + line.quantity,
          });
        }
      }

      const seqB04 = ncfSequences.find((s) => s.type === 'B04');

      setPrintData({
        isFiscal: emittedB04.isFiscal,
        brand: activeBrand,
        corporate,
        ncfSequence: seqB04,
        documentCode: emittedB04.documentCode,
        modifiedNcf: emittedB04.modifiedNcf,
        customTitle: originalDoc.isFiscal
          ? 'NOTA DE CRÉDITO FISCAL (B04)'
          : 'NOTA DE DEVOLUCIÓN INTERNA',
        authorizationNo: emittedB04.authorizationNo,
        expirationDate: emittedB04.expirationDate,
        clientName: emittedB04.customerName,
        clientRncOrCedula: emittedB04.customerRncOrCedula,
        clientPhone: emittedB04.customerPhone,
        createdAt: emittedB04.createdAt,
        items: emittedB04.items,
        subtotal: emittedB04.subtotal,
        itbisAmount: emittedB04.itbisAmount,
        totalAmount: emittedB04.totalAmount,
        amountPaid: emittedB04.totalAmount,
        balanceDue: 0,
        notes: `Devolución / Anulación sobre comprobante ${
          originalDoc.ncfNumber || originalDoc.documentCode
        }. Stock restaurado.`,
      });

      showToast(
        `Nota de Crédito ${emittedB04.documentCode} emitida y stock restaurado.`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al emitir Nota de Crédito B04.';
      showToast(msg);
    }
  };

  const handleReprintSale = (doc: IssuedDocument) => {
    const seq = doc.ncfType
      ? ncfSequences.find((s) => s.type === doc.ncfType)
      : undefined;

    setPrintData({
      isFiscal: doc.isFiscal,
      brand: activeBrand,
      corporate,
      ncfSequence: seq,
      documentCode: doc.documentCode,
      modifiedNcf: doc.modifiedNcf,
      authorizationNo: doc.authorizationNo,
      expirationDate: doc.expirationDate,
      clientName: doc.customerName,
      clientRncOrCedula: doc.customerRncOrCedula,
      clientPhone: doc.customerPhone,
      createdAt: doc.createdAt,
      items: doc.items,
      subtotal: doc.subtotal,
      itbisAmount: doc.itbisAmount,
      legalTipAmount: doc.legalTipAmount,
      totalAmount: doc.totalAmount,
      amountPaid: doc.amountPaid,
      balanceDue: doc.balanceDue,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          <Check className="w-4 h-4 text-teal-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* COLUMNA IZQUIERDA (7 COLS): REJILLA DE PRODUCTOS + HISTORIAL DEL TURNO */}
      <div className="lg:col-span-7 space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Escanear código o buscar producto (Enter para agregar)..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-slate-900"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>

            <button
              type="button"
              onClick={() => {
                setShiftCountedCash(String(shiftSummary.expectedDrawerCash));
                setCashShiftModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0 shadow-xs transition-colors"
            >
              <Calculator className="w-4 h-4 text-teal-400" />
              <span>Corte de Caja / Cuadre (X/Z)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'ALL' ? 'Todos' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* REJILLA DE PRODUCTOS (2 COLUMNAS COMPACTAS EN MÓVIL Y ESCRITORIO) */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
          {filteredProducts.map((product) => {
            const outOfStock =
              !product.isService &&
              typeof product.stock === 'number' &&
              product.stock <= 0;

            return (
              <button
                key={product.id || product.code}
                type="button"
                disabled={outOfStock}
                onClick={() => handleAddToCart(product)}
                className={`bg-white rounded-2xl border p-4 text-left flex flex-col justify-between transition-all shadow-xs ${
                  outOfStock
                    ? 'border-slate-200 opacity-50 cursor-not-allowed'
                    : 'border-slate-200/90 hover:border-slate-900 hover:shadow-sm'
                }`}
              >
                <div className="space-y-1.5 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {product.code}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
                        {product.unit}
                      </span>

                      {!product.isService && typeof product.stock === 'number' ? (
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            product.stock <= 3
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          Stock: {product.stock}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-sky-50 text-sky-700">
                          Servicio
                        </span>
                      )}
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 line-clamp-2 pt-1">
                    {product.name}
                  </h4>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 w-full flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    {product.category}
                  </span>
                  <span className="text-sm font-mono font-extrabold text-slate-900">
                    RD${' '}
                    {product.price.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* HISTORIAL RÁPIDO DE VENTAS DEL DÍA / TURNO + NOTA DE CRÉDITO B04 */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <History className="w-4 h-4 text-teal-600" />
              <span>Ventas Recientes del Turno ({recentSales.length})</span>
            </h4>
            <span className="text-[11px] text-slate-400">
              Reimpresión y Devoluciones B04
            </span>
          </div>

          {recentSales.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center">
              Aún no se han emitido ventas en este turno.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {recentSales.map((sale) => {
                const isCreditNote = sale.ncfType === 'B04' || Boolean(sale.modifiedNcf);
                return (
                  <div
                    key={sale.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          isCreditNote
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : sale.isFiscal
                            ? 'bg-teal-50 text-teal-800 border border-teal-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {sale.documentCode}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {sale.customerName}
                        </p>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(sale.createdAt).toLocaleTimeString('es-DO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {sale.modifiedNcf ? ` • Ref: ${sale.modifiedNcf}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-slate-900">
                        RD${' '}
                        {sale.totalAmount.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleReprintSale(sale)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                        title="Reimprimir / Enviar por WhatsApp"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      {!isCreditNote && (
                        <button
                          type="button"
                          onClick={() => handleIssueCreditNoteB04(sale)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold"
                          title="Emitir Nota de Crédito B04 y restaurar stock"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>B04</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* COLUMNA DERECHA (5 COLS EN ESCRITORIO / DRAWER FULLSCREEN EN MÓVIL): CARRITO EDITABLE Y TERMINAL DE COBRO */}
      <div
        className={`${
          mobileCartDrawerOpen
            ? 'fixed inset-0 z-50 bg-white p-4 sm:p-5 overflow-y-auto flex flex-col'
            : 'hidden lg:flex lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex-col overflow-hidden'
        }`}
      >
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-slate-900" />
            <h3 className="text-sm font-bold text-slate-900">
              Ticket de Venta ({cart.reduce((a, b) => a + b.quantity, 0)})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAllowPriceOverride((prev) => !prev);
                showToast(
                  !allowPriceOverride
                    ? 'Modo Supervisor: Edición de precio/descuento habilitada.'
                    : 'Precios bloqueados a tarifa de catálogo.'
                );
              }}
              title="Autorizar cambio de precio / descuento manual"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                allowPriceOverride
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              {allowPriceOverride ? (
                <>
                  <Unlock className="w-3 h-3 text-amber-600" />
                  <span>Precio Libre</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" />
                  <span>Precio Fijo</span>
                </>
              )}
            </button>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
              >
                Vaciar
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileCartDrawerOpen(false)}
              className="lg:hidden p-1.5 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900"
              title="Cerrar carrito móvil"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LISTA DE ÍTEMS EN EL CARRITO CON EDICIÓN DE PRECIO, DESCUENTO Y NOTA */}
        <div className="p-4 space-y-3 max-h-80 overflow-y-auto divide-y divide-slate-100">
          {cart.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Package className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-400">
                Selecciona equipos o servicios de la rejilla para facturar.
              </p>
            </div>
          ) : (
            cart.map((item) => {
              const isExpanded = expandedCartItemId === item.id;
              const lineNet = Math.max(
                0,
                roundCurrency(
                  item.quantity * item.unitPrice - (item.discount || 0)
                )
              );

              return (
                <div key={item.id} className="pt-2.5 first:pt-0 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCartItemId(isExpanded ? null : item.id)
                      }
                      className="min-w-0 flex-1 text-left"
                      title="Haz clic para ajustar precio, descuento o nota"
                    >
                      <p className="font-semibold text-slate-900 truncate hover:text-teal-700">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                        <span>
                          RD${' '}
                          {item.unitPrice.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}{' '}
                          / {item.unit}
                        </span>
                        {item.discount && item.discount > 0 ? (
                          <span className="text-rose-600 font-bold">
                            (-RD$ {item.discount})
                          </span>
                        ) : null}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.id, -1)}
                        className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-mono font-bold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.id, 1)}
                        className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="w-24 text-right font-mono font-bold text-slate-900 shrink-0">
                      RD${' '}
                      {lineNet.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* NOTA / SERIAL Y EDICIÓN SUPERVISADA DE PRECIO / DESCUENTO */}
                  {(isExpanded || allowPriceOverride || Boolean(item.notes)) && (
                    <div className="grid grid-cols-12 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/70">
                      <div className="col-span-4">
                        <label className="text-[10px] text-slate-400 block">
                          Precio Unit.
                        </label>
                        {allowPriceOverride ? (
                          <input
                            type="number"
                            min={0}
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleUpdateItemField(
                                item.id,
                                'unitPrice',
                                Number(e.target.value)
                              )
                            }
                            className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 font-mono text-[11px]"
                          />
                        ) : (
                          <div className="w-full rounded-lg border border-slate-200/80 bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-600 select-none">
                            RD${' '}
                            {item.unitPrice.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                        )}
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] text-slate-400 block">
                          Desc. (RD$)
                        </label>
                        {allowPriceOverride ? (
                          <input
                            type="number"
                            min={0}
                            value={item.discount || 0}
                            onChange={(e) =>
                              handleUpdateItemField(
                                item.id,
                                'discount',
                                Number(e.target.value)
                              )
                            }
                            className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 font-mono text-[11px]"
                          />
                        ) : (
                          <div className="w-full rounded-lg border border-slate-200/80 bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500 select-none">
                            RD$ {(item.discount || 0).toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] text-slate-400 block">
                          Nota / Serial
                        </label>
                        <input
                          type="text"
                          placeholder="Opcional"
                          value={item.notes || ''}
                          onChange={(e) =>
                            handleUpdateItemField(
                              item.id,
                              'notes',
                              e.target.value
                            )
                          }
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* CONFIGURACIÓN DE CLIENTE, MODO FISCAL Y MÉTODO DE COBRO */}
        <div className="p-5 bg-slate-50/70 border-t border-slate-200 space-y-4 text-xs">
          {/* SELECTOR DE CLIENTE + BOTÓN NUEVO CLIENTE RÁPIDO */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <User className="w-3.5 h-3.5" />
                <span>Cliente</span>
              </div>
              <button
                type="button"
                onClick={() => setNewClientModalOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800"
              >
                <UserPlus className="w-3 h-3" />
                <span>+ Nuevo</span>
              </button>
            </div>

            <select
              value={selectedClientId}
              onChange={(e) => handleSelectClient(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            >
              <option value="">Consumidor Final (Contado)</option>
              {clients.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} • {c.rncOrCedula}
                </option>
              ))}
            </select>

            {isFiscal && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Razón Social / Nombre"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5"
                />
                <input
                  type="text"
                  placeholder="RNC (9) o Cédula (11)"
                  value={customerRnc}
                  onChange={(e) => setCustomerRnc(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono"
                />
              </div>
            )}
          </div>

          {/* MODO DE COMPROBANTE: RECIBO INTERNO VS FACTURA FISCAL (NCF) */}
          <div className="space-y-1.5">
            <span className="font-semibold text-slate-700 block">
              Modalidad de Facturación
            </span>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-200/70">
              <button
                type="button"
                onClick={() => setIsFiscal(false)}
                className={`py-2 px-3 rounded-lg font-semibold transition-all ${
                  !isFiscal
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Recibo Interno
              </button>
              <button
                type="button"
                onClick={() => setIsFiscal(true)}
                className={`py-2 px-3 rounded-lg font-semibold transition-all ${
                  isFiscal
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                Factura Fiscal (NCF)
              </button>
            </div>

            {isFiscal && (
              <select
                value={ncfType}
                onChange={(e) => setNcfType(e.target.value as 'B01' | 'B02')}
                className="w-full mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
              >
                <option value="B01">B01 • Factura de Crédito Fiscal</option>
                <option value="B02">B02 • Factura de Consumo</option>
              </select>
            )}
          </div>

          {/* MÉTODO DE COBRO Y BOTONES DE EFECTIVO RÁPIDO */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Forma de Pago</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`py-2 rounded-xl font-semibold border text-xs transition-all ${
                    paymentMethod === m
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {m === 'EFECTIVO'
                    ? 'Efectivo'
                    : m === 'TRANSFERENCIA'
                    ? 'Transferencia'
                    : 'Tarjeta'}
                </button>
              ))}
            </div>

            {paymentMethod === 'EFECTIVO' && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCashTendered(String(totals.totalAmount))}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-mono text-[11px] font-semibold text-slate-800"
                  >
                    Exacto
                  </button>
                  {[500, 1000, 2000, 5000].map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      onClick={() => setCashTendered(String(bill))}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 font-mono text-[11px] font-semibold text-slate-800"
                    >
                      RD$ {bill.toLocaleString('es-DO')}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block">
                      Efectivo Recibido (RD$)
                    </label>
                    <input
                      type="number"
                      min={0}
                      placeholder="0.00"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">
                      Devuelta al Cliente
                    </label>
                    <div className="rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 font-mono font-bold text-teal-700">
                      RD${' '}
                      {changeDue.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* DESCUENTO Y CÓDIGO PROMOCIONAL */}
          <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-700 flex items-center gap-1 text-[11px]">
                <Tag className="w-3.5 h-3.5 text-teal-600" />
                <span>Código / Descuento</span>
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Ej. VIP10"
                  value={promoCodeInput}
                  onChange={(e) =>
                    setPromoCodeInput(e.target.value.toUpperCase())
                  }
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1 font-mono text-[11px] uppercase"
                />
                <button
                  type="button"
                  onClick={handleApplyPromoCode}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold"
                >
                  Aplicar
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <select
                  value={globalDiscountType}
                  onChange={(e) =>
                    setGlobalDiscountType(
                      e.target.value as 'PERCENT' | 'FIXED'
                    )
                  }
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold"
                >
                  <option value="PERCENT">% Desc.</option>
                  <option value="FIXED">RD$ Fijo</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={globalDiscountVal}
                  onChange={(e) => {
                    setGlobalDiscountVal(Number(e.target.value));
                    setAppliedPromoCode('');
                  }}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 font-mono text-[11px]"
                />
              </div>
              {appliedPromoCode && (
                <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-mono text-[10px] font-bold">
                  Cupón: {appliedPromoCode}
                </span>
              )}
            </div>
          </div>

          {/* RESUMEN DE TOTALES */}
          <div className="pt-3 border-t border-slate-200 space-y-1.5 font-mono">
            {totals.discountTotal > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Descuentos:</span>
                <span>
                  - RD${' '}
                  {totals.discountTotal.toLocaleString('es-DO', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>Subtotal Neto:</span>
              <span>
                RD${' '}
                {totals.netSubtotal.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            {isFiscal && (
              <div className="flex justify-between text-slate-800">
                <span>18% ITBIS:</span>
                <span>
                  RD${' '}
                  {totals.itbisAmount.toLocaleString('es-DO', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div className="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-slate-200">
              <span>TOTAL A COBRAR:</span>
              <span>
                RD${' '}
                {totals.totalAmount.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCompleteSale}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Cobrar e Imprimir Comprobante</span>
          </button>
        </div>
      </div>

      {/* BARRA FLOTANTE INFERIOR EN MÓVIL CUANDO HAY ÍTEMS EN EL CARRITO */}
      {cart.length > 0 && !mobileCartDrawerOpen && (
        <div className="fixed bottom-16 inset-x-3 z-30 lg:hidden p-3 rounded-2xl bg-slate-900 text-white flex items-center justify-between shadow-2xl border border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500 text-slate-950 font-mono font-extrabold text-xs flex items-center justify-center">
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-300 block">
                Total en Carrito
              </span>
              <span className="text-sm font-mono font-extrabold text-white">
                RD${' '}
                {totals.totalAmount.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileCartDrawerOpen(true)}
            className="px-4 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Cobrar / Ver Carrito</span>
          </button>
        </div>
      )}

      {/* MODAL DE CUADRE Y CIERRE DE CAJA DEL TURNO (CORTE X / Z) */}
      {cashShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-teal-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    Corte de Caja / Cuadre del Turno (X / Z)
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {activeBrand.name} • {shiftSummary.txCount} ventas hoy
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCashShiftModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                    Efectivo Ventas
                  </span>
                  <span className="font-mono font-extrabold text-sm text-emerald-950">
                    RD${' '}
                    {shiftSummary.totalCash.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                  <span className="text-[10px] font-bold uppercase text-sky-700 block">
                    Tarjetas (POS)
                  </span>
                  <span className="font-mono font-extrabold text-sm text-sky-950">
                    RD${' '}
                    {shiftSummary.totalCard.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
                  <span className="text-[10px] font-bold uppercase text-purple-700 block">
                    Transferencias
                  </span>
                  <span className="font-mono font-extrabold text-sm text-purple-950">
                    RD${' '}
                    {shiftSummary.totalTransfer.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Fondo Inicial de Caja (RD$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={shiftInitialCash}
                    onChange={(e) => setShiftInitialCash(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Efectivo Contado en Gaveta (RD$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={shiftCountedCash}
                    onChange={(e) => setShiftCountedCash(e.target.value)}
                    placeholder={String(shiftSummary.expectedDrawerCash)}
                    className="w-full px-3 py-2 rounded-xl border border-teal-500 bg-teal-50/30 font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Efectivo Esperado (Fondo + Ventas Efec.):</span>
                  <span className="font-bold text-slate-900">
                    RD${' '}
                    {shiftSummary.expectedDrawerCash.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total General Ventas del Turno:</span>
                  <span className="font-bold text-slate-900">
                    RD${' '}
                    {shiftSummary.totalSales.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-extrabold">
                  <span>Diferencia (Sobrante / Faltante):</span>
                  <span
                    className={
                      shiftSummary.diff === 0
                        ? 'text-emerald-700'
                        : shiftSummary.diff > 0
                        ? 'text-sky-700'
                        : 'text-rose-600'
                    }
                  >
                    {shiftSummary.diff > 0 ? '+' : ''}RD${' '}
                    {shiftSummary.diff.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    {shiftSummary.diff === 0
                      ? '(EXACTO)'
                      : shiftSummary.diff > 0
                      ? '(SOBRANTE)'
                      : '(FALTANTE)'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Observaciones del Cierre (Opcional)
                </label>
                <input
                  type="text"
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  placeholder="Ej: Turno matutino sin novedades"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleCloseShiftAndPrintZ('X')}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Corte X (Parcial)</span>
              </button>
              <button
                type="button"
                onClick={() => handleCloseShiftAndPrintZ('Z')}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 text-teal-400" />
                <span>Cerrar Turno e Imprimir Ticket 80mm (Corte Z)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREACIÓN RÁPIDA DE CLIENTE */}
      {newClientModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Nuevo Cliente Rápido
              </h3>
              <button
                type="button"
                onClick={() => setNewClientModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={handleQuickCreateClient}
              className="p-6 space-y-4 text-xs"
            >
              <div>
                <label className="font-medium text-slate-600 block mb-1">
                  Nombre o Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    RNC (9) o Cédula (11)
                  </label>
                  <input
                    type="text"
                    value={newClientRnc}
                    onChange={(e) => setNewClientRnc(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Teléfono (WhatsApp)
                  </label>
                  <input
                    type="text"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="font-medium text-slate-600 block mb-1">
                  Comprobante Preferido
                </label>
                <select
                  value={newClientPrefNcf}
                  onChange={(e) =>
                    setNewClientPrefNcf(e.target.value as 'B01' | 'B02')
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white font-mono"
                >
                  <option value="B01">B01 • Crédito Fiscal</option>
                  <option value="B02">B02 • Consumo</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setNewClientModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold"
                >
                  Guardar y Seleccionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE IMPRESIÓN Y WHATSAPP */}
      <InvoicePrintModal
        data={printData}
        onClose={() => setPrintData(null)}
      />
    </div>
  );
};
