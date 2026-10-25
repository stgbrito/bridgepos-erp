import React, { useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  CreditCard,
  FileText,
  MessageCircle,
  Plus,
  Printer,
  Ruler,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  db,
  type AtelierOrderSpec,
  type BrandProfile,
  type CatalogItem,
  type ClientProfile,
  type CorporateConfig,
  type InvoiceItem,
  type NCFSequence,
  type OrderPaymentRecord,
  type PaymentMethod,
  type ServiceOrder,
  type ServiceOrderStatus,
  type TechnicalOrderSpec,
} from '../db/db';
import {
  buildWhatsAppShareUrl,
  calculateInvoiceTotals,
  consumeNextInternalNumber,
  consumeNextNCF,
  consumeNextQuoteNumber,
  roundCurrency,
} from '../services/fiscalService';
import {
  InvoicePrintModal,
  type PrintableDocumentData,
} from '../components/InvoicePrintModal';

interface ServiceOrdersViewProps {
  activeBrand: BrandProfile;
  corporate: CorporateConfig;
  ncfSequences: NCFSequence[];
  orders: ServiceOrder[];
  clients: ClientProfile[];
  catalogItems: CatalogItem[];
}

const STATUS_LABELS: Record<
  ServiceOrderStatus,
  { label: string; badgeClass: string }
> = {
  COTIZACION: {
    label: 'Cotización',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  PENDIENTE: {
    label: 'Pendiente',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  EN_PROCESO: {
    label: 'En Taller / Ejecución',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  LISTO: {
    label: 'Listo para Entrega',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  ENTREGADO: {
    label: 'Entregado',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
};

const WORKFLOW_STATUSES: ServiceOrderStatus[] = [
  'PENDIENTE',
  'EN_PROCESO',
  'LISTO',
  'ENTREGADO',
];

export const ServiceOrdersView: React.FC<ServiceOrdersViewProps> = ({
  activeBrand,
  corporate,
  ncfSequences,
  orders,
  clients,
  catalogItems,
}) => {
  const isAtelier = activeBrand.id === 'atelier';

  // Filtros de lista
  const [filterStatus, setFilterStatus] = useState<ServiceOrderStatus | 'ALL'>(
    'ALL'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  // Modal de Nueva Cotización / Orden
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [createKind, setCreateKind] = useState<'QUOTE' | 'ORDER'>('ORDER');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [clientRnc, setClientRnc] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');

  // Ítems del formulario
  const [formItems, setFormItems] = useState<InvoiceItem[]>([]);

  // Campos dinámicos: Atelier vs Técnico
  const [atelierSpec, setAtelierSpec] = useState<AtelierOrderSpec>({
    bust: '',
    waist: '',
    hips: '',
    length: '',
    fabricAndDesign: '',
    fittingDate: '',
    deliveryDate: '',
  });

  const [techSpec, setTechSpec] = useState<TechnicalOrderSpec>({
    equipmentOrArea: '',
    serialOrModel: '',
    diagnosisAndWork: '',
    warrantyPeriod: '6 Meses',
    deliveryDate: '',
  });

  // Pago / Abono inicial al crear orden
  const [initialPaymentMode, setInitialPaymentMode] = useState<
    'NONE' | '50_PERCENT' | 'FULL' | 'CUSTOM'
  >('50_PERCENT');
  const [customInitialAmount, setCustomInitialAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('TRANSFERENCIA');
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Modal de Registrar Abono / Facturación Fiscal sobre orden existente
  const [paymentOrder, setPaymentOrder] = useState<ServiceOrder | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('TRANSFERENCIA');
  const [payNote, setPayNote] = useState<string>('Abono / Saldo de orden');
  const [payDocMode, setPayDocMode] = useState<'INTERNAL' | 'FISCAL'>(
    'INTERNAL'
  );
  const [payNcfType, setPayNcfType] = useState<'B01' | 'B02'>('B01');

  // Modal de Impresión Dual
  const [printData, setPrintData] = useState<PrintableDocumentData | null>(
    null
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Filtrar órdenes de la marca activa
  const brandOrders = orders.filter((o) => o.brandId === activeBrand.id);
  const brandCatalog = catalogItems.filter(
    (c) => c.brandId === activeBrand.id && c.active
  );

  const filteredOrders = brandOrders.filter((order) => {
    const matchesStatus =
      filterStatus === 'ALL' || order.status === filterStatus;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      order.orderCode.toLowerCase().includes(q) ||
      order.clientName.toLowerCase().includes(q) ||
      (order.clientPhone && order.clientPhone.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  // Abrir modal de creación
  const handleOpenCreateModal = (kind: 'QUOTE' | 'ORDER') => {
    setCreateKind(kind);
    setSelectedClientId('');
    setClientName('');
    setClientRnc('');
    setClientPhone('');

    const defaultCatalog = brandCatalog[0];
    setFormItems(
      defaultCatalog
        ? [
            {
              id: String(Date.now()),
              code: defaultCatalog.code,
              description: defaultCatalog.name,
              quantity: 1,
              unit: defaultCatalog.unit,
              unitPrice: defaultCatalog.price,
            },
          ]
        : [
            {
              id: String(Date.now()),
              description: '',
              quantity: 1,
              unit: 'SERV',
              unitPrice: 0,
            },
          ]
    );

    setAtelierSpec({
      bust: '',
      waist: '',
      hips: '',
      length: '',
      fabricAndDesign: '',
      fittingDate: '',
      deliveryDate: '',
    });

    setTechSpec({
      equipmentOrArea: '',
      serialOrModel: '',
      diagnosisAndWork: '',
      warrantyPeriod: '6 Meses',
      deliveryDate: '',
    });

    setInitialPaymentMode(kind === 'QUOTE' ? 'NONE' : '50_PERCENT');
    setCustomInitialAmount(0);
    setOrderNotes('');
    setCreateModalOpen(true);
  };

  // Seleccionar cliente existente y autocompletar medidas si es Atelier
  const handleSelectClient = (clientIdStr: string) => {
    setSelectedClientId(clientIdStr);
    const found = clients.find((c) => String(c.id) === clientIdStr);
    if (found) {
      setClientName(found.name);
      setClientRnc(found.rncOrCedula);
      setClientPhone(found.phone);
      if (found.measurements) {
        setAtelierSpec((prev) => ({
          ...prev,
          bust: found.measurements?.bust || prev.bust,
          waist: found.measurements?.waist || prev.waist,
          hips: found.measurements?.hips || prev.hips,
          length: found.measurements?.length || prev.length,
        }));
      }
    }
  };

  const handleAddCatalogItemToForm = (catItem: CatalogItem) => {
    setFormItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        code: catItem.code,
        description: catItem.name,
        quantity: 1,
        unit: catItem.unit,
        unitPrice: catItem.price,
      },
    ]);
  };

  const handleUpdateFormItem = (
    id: string,
    field: keyof InvoiceItem,
    value: string | number
  ) => {
    setFormItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveFormItem = (id: string) => {
    if (formItems.length <= 1) return;
    setFormItems((prev) => prev.filter((item) => item.id !== id));
  };

  const formSubtotal = formItems.reduce(
    (acc, item) => acc + roundCurrency(item.quantity * item.unitPrice),
    0
  );

  const computedInitialDeposit = (() => {
    if (createKind === 'QUOTE' || initialPaymentMode === 'NONE') return 0;
    if (initialPaymentMode === '50_PERCENT')
      return roundCurrency(formSubtotal * 0.5);
    if (initialPaymentMode === 'FULL') return formSubtotal;
    return Math.min(formSubtotal, Math.max(0, roundCurrency(customInitialAmount)));
  })();

  // Guardar Nueva Cotización u Orden de Trabajo
  const handleSaveNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      showToast('Ingrese el nombre del cliente.');
      return;
    }

    const validItems = formItems.filter(
      (i) => i.description.trim() !== '' && i.quantity > 0
    );
    if (validItems.length === 0) {
      showToast('Agregue al menos un servicio o ítem válido.');
      return;
    }

    let orderCode = '';
    if (createKind === 'QUOTE') {
      const q = await consumeNextQuoteNumber(activeBrand.id);
      orderCode = q.quoteCode;
    } else {
      const ord = await consumeNextInternalNumber(activeBrand.id);
      orderCode = ord.internalCode;
    }

    const totalAmount = formSubtotal;
    const paid = createKind === 'QUOTE' ? 0 : computedInitialDeposit;
    const balance = roundCurrency(totalAmount - paid);

    const payments: OrderPaymentRecord[] =
      paid > 0
        ? [
            {
              id: `pay-${Date.now()}`,
              date: new Date().toISOString(),
              amount: paid,
              method: paymentMethod,
              note:
                paid === totalAmount
                  ? 'Pago total al ordenar'
                  : 'Abono inicial',
              receiptCode: `REC-${orderCode}`,
            },
          ]
        : [];

    const newOrder: ServiceOrder = {
      orderCode,
      brandId: activeBrand.id,
      brandName: activeBrand.name,
      status: createKind === 'QUOTE' ? 'COTIZACION' : 'PENDIENTE',
      clientId: selectedClientId ? Number(selectedClientId) : undefined,
      clientName: clientName.trim(),
      clientRncOrCedula: clientRnc.trim(),
      clientPhone: clientPhone.trim(),
      items: validItems,
      isFiscal: false,
      subtotal: formSubtotal,
      itbisAmount: 0,
      totalAmount,
      amountPaid: paid,
      balanceDue: balance,
      payments,
      atelierSpec: isAtelier ? atelierSpec : undefined,
      techSpec: !isAtelier ? techSpec : undefined,
      notes: orderNotes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const id = await db.serviceOrders.add(newOrder);
    setCreateModalOpen(false);
    showToast(
      createKind === 'QUOTE'
        ? `Cotización ${orderCode} creada.`
        : `Orden ${orderCode} registrada.`
    );

    openPrintForOrder({ ...newOrder, id });
  };

  // Convertir Cotización en Orden de Trabajo en 1 clic
  const handleConvertQuoteToOrder = async (quote: ServiceOrder) => {
    if (!quote.id) return;
    const allocated = await consumeNextInternalNumber(activeBrand.id);
    const updated: ServiceOrder = {
      ...quote,
      orderCode: allocated.internalCode,
      status: 'PENDIENTE',
      updatedAt: new Date().toISOString(),
    };
    await db.serviceOrders.put(updated);
    showToast(
      `Cotización convertida en Orden ${allocated.internalCode}.`
    );
  };

  // Cambiar estado de la orden (PENDIENTE -> EN_PROCESO -> LISTO -> ENTREGADO)
  const handleChangeOrderStatus = async (
    order: ServiceOrder,
    nextStatus: ServiceOrderStatus
  ) => {
    if (!order.id) return;
    await db.serviceOrders.update(order.id, {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
    showToast(
      `Estado de ${order.orderCode} actualizado a ${STATUS_LABELS[nextStatus].label}.`
    );
  };

  // Abrir modal de Abono / Cobro de Saldo / Emisión NCF
  const handleOpenPaymentModal = (order: ServiceOrder) => {
    setPaymentOrder(order);
    const suggested =
      order.amountPaid === 0 && order.balanceDue > 0
        ? roundCurrency(order.totalAmount * 0.5)
        : order.balanceDue;
    setPayAmount(suggested);
    setPayMethod('TRANSFERENCIA');
    setPayNote(
      order.amountPaid === 0
        ? 'Abono inicial 50%'
        : 'Pago de saldo / entrega'
    );
    setPayDocMode(order.isFiscal ? 'FISCAL' : 'INTERNAL');
    const clientMatch = clients.find((c) => c.id === order.clientId);
    setPayNcfType(clientMatch?.preferredNcfType || 'B01');
  };

  // Registrar el abono o emitir la factura fiscal NCF
  const handleConfirmOrderPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentOrder || !paymentOrder.id) return;

    try {
      let updatedSubtotal = paymentOrder.subtotal;
      let updatedItbis = paymentOrder.itbisAmount;
      let updatedTotal = paymentOrder.totalAmount;
      let updatedIsFiscal = paymentOrder.isFiscal;
      let ncfNumber = paymentOrder.ncfNumber;
      let ncfType = paymentOrder.ncfType;
      let authorizationNo = paymentOrder.authorizationNo;
      let expirationDate = paymentOrder.expirationDate;

      // Si el usuario solicita Factura Fiscal (NCF) y la orden aún era interna
      if (payDocMode === 'FISCAL' && !paymentOrder.isFiscal) {
        const consumed = await consumeNextNCF(payNcfType);
        const fiscalTotals = calculateInvoiceTotals(paymentOrder.items, {
          isFiscal: true,
        });

        updatedIsFiscal = true;
        ncfType = payNcfType;
        ncfNumber = consumed.ncf;
        authorizationNo = consumed.authorizationNo;
        expirationDate = consumed.expirationDate;
        updatedSubtotal = fiscalTotals.netSubtotal;
        updatedItbis = fiscalTotals.itbisAmount;
        updatedTotal = fiscalTotals.totalAmount;

        await db.documents.add({
          documentCode: consumed.ncf,
          brandId: activeBrand.id,
          brandName: activeBrand.name,
          moduleUsed: 'SERVICE_MODULE',
          isFiscal: true,
          ncfType: payNcfType,
          ncfNumber: consumed.ncf,
          authorizationNo: consumed.authorizationNo,
          expirationDate: consumed.expirationDate,
          customerName: paymentOrder.clientName,
          customerRncOrCedula: paymentOrder.clientRncOrCedula,
          customerPhone: paymentOrder.clientPhone,
          items: paymentOrder.items,
          subtotal: fiscalTotals.netSubtotal,
          discountTotal: 0,
          taxableAmount: fiscalTotals.taxableBase,
          itbisAmount: fiscalTotals.itbisAmount,
          legalTipAmount: 0,
          totalAmount: fiscalTotals.totalAmount,
          amountPaid: roundCurrency(paymentOrder.amountPaid + Math.max(0, roundCurrency(payAmount))),
          balanceDue: Math.max(
            0,
            roundCurrency(
              fiscalTotals.totalAmount -
                (paymentOrder.amountPaid + Math.max(0, roundCurrency(payAmount)))
            )
          ),
          goesTo607: true,
          goesTo606: false,
          createdAt: new Date().toISOString(),
          syncStatus: 'LOCAL_ONLY',
        });
      }

      const cleanPayment = Math.max(0, roundCurrency(payAmount));
      const newAmountPaid = roundCurrency(
        paymentOrder.amountPaid + cleanPayment
      );
      const newBalanceDue = Math.max(
        0,
        roundCurrency(updatedTotal - newAmountPaid)
      );

      const receiptCode =
        updatedIsFiscal && ncfNumber
          ? ncfNumber
          : `ABONO-${String(paymentOrder.payments.length + 1).padStart(4, '0')}`;

      const updatedPayments: OrderPaymentRecord[] =
        cleanPayment > 0
          ? [
              ...paymentOrder.payments,
              {
                id: `pay-${Date.now()}`,
                date: new Date().toISOString(),
                amount: cleanPayment,
                method: payMethod,
                note: payNote.trim() || 'Abono registrado',
                receiptCode,
                isFiscalReceipt: updatedIsFiscal,
                ncfNumber,
              },
            ]
          : paymentOrder.payments;

      const nextStatus: ServiceOrderStatus =
        newBalanceDue === 0 && paymentOrder.status === 'LISTO'
          ? 'ENTREGADO'
          : paymentOrder.status === 'COTIZACION'
          ? 'PENDIENTE'
          : paymentOrder.status;

      const updatedOrder: ServiceOrder = {
        ...paymentOrder,
        status: nextStatus,
        isFiscal: updatedIsFiscal,
        ncfType,
        ncfNumber,
        authorizationNo,
        expirationDate,
        subtotal: updatedSubtotal,
        itbisAmount: updatedItbis,
        totalAmount: updatedTotal,
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        payments: updatedPayments,
        updatedAt: new Date().toISOString(),
      };

      await db.serviceOrders.put(updatedOrder);
      setPaymentOrder(null);
      showToast(
        updatedIsFiscal
          ? `Pago registrado y NCF ${ncfNumber} emitido.`
          : `Abono registrado en ${updatedOrder.orderCode}.`
      );

      openPrintForOrder(updatedOrder, cleanPayment > 0 && !updatedIsFiscal);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al procesar el pago.';
      showToast(msg);
    }
  };

  // Preparar modal de impresión para cualquier orden/cotización/recibo
  const openPrintForOrder = (
    order: ServiceOrder,
    asDepositReceipt = false
  ) => {
    const seq = order.ncfType
      ? ncfSequences.find((s) => s.type === order.ncfType)
      : undefined;

    let internalTitle:
      | 'COTIZACION'
      | 'ORDEN_DE_SERVICIO'
      | 'RECIBO_DE_ABONO'
      | 'RECIBO_DE_PAGO' = 'ORDEN_DE_SERVICIO';

    if (order.status === 'COTIZACION') {
      internalTitle = 'COTIZACION';
    } else if (asDepositReceipt || (order.amountPaid > 0 && order.balanceDue > 0)) {
      internalTitle = 'RECIBO_DE_ABONO';
    } else if (order.balanceDue === 0 && order.amountPaid > 0) {
      internalTitle = 'RECIBO_DE_PAGO';
    }

    setPrintData({
      isFiscal: order.isFiscal,
      brand: activeBrand,
      corporate,
      ncfSequence: seq,
      documentCode:
        order.isFiscal && order.ncfNumber ? order.ncfNumber : order.orderCode,
      internalDocTitle: internalTitle,
      authorizationNo: order.authorizationNo,
      expirationDate: order.expirationDate,
      clientName: order.clientName,
      clientRncOrCedula: order.clientRncOrCedula,
      clientPhone: order.clientPhone,
      createdAt: order.updatedAt || order.createdAt,
      items: order.items,
      subtotal: order.subtotal,
      itbisAmount: order.itbisAmount,
      totalAmount: order.totalAmount,
      amountPaid: order.amountPaid,
      balanceDue: order.balanceDue,
      payments: order.payments,
      atelierSpec: order.atelierSpec,
      techSpec: order.techSpec,
      notes: order.notes,
    });
  };

  // Resumen financiero rápido de la marca activa
  const totalAgreedAll = brandOrders
    .filter((o) => o.status !== 'COTIZACION')
    .reduce((acc, o) => acc + o.totalAmount, 0);
  const totalCollectedAll = brandOrders
    .filter((o) => o.status !== 'COTIZACION')
    .reduce((acc, o) => acc + o.amountPaid, 0);
  const totalPendingAll = brandOrders
    .filter((o) => o.status !== 'COTIZACION')
    .reduce((acc, o) => acc + o.balanceDue, 0);

  return (
    <div className="space-y-6">
      {/* NOTIFICACIÓN */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          <Check className="w-4 h-4 text-teal-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* TARJETAS DE RESUMEN DE ÓRDENES Y ABONOS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
            Total en Órdenes Activas
          </span>
          <span className="text-xl font-mono font-bold text-slate-900 mt-1 block">
            RD${' '}
            {totalAgreedAll.toLocaleString('es-DO', {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-600 block">
            Total Abonado / Cobrado
          </span>
          <span className="text-xl font-mono font-bold text-teal-700 mt-1 block">
            RD${' '}
            {totalCollectedAll.toLocaleString('es-DO', {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 block">
            Balance Pendiente por Cobrar
          </span>
          <span className="text-xl font-mono font-bold text-slate-900 mt-1 block">
            RD${' '}
            {totalPendingAll.toLocaleString('es-DO', {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* BARRA DE FILTROS Y ACCIONES RÁPIDAS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Todas' },
              { id: 'COTIZACION', label: 'Cotizaciones' },
              { id: 'PENDIENTE', label: 'Pendientes' },
              { id: 'EN_PROCESO', label: 'En Proceso' },
              { id: 'LISTO', label: 'Listos' },
              { id: 'ENTREGADO', label: 'Entregados' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterStatus === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar orden o cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-900 w-48 focus:outline-none focus:border-slate-400"
            />
          </div>

          <button
            type="button"
            onClick={() => handleOpenCreateModal('QUOTE')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Nueva Cotización</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal('ORDER')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {isAtelier ? 'Nueva Orden de Confección' : 'Nueva Orden de Servicio'}
            </span>
          </button>
        </div>
      </div>

      {/* LISTADO DE COTIZACIONES Y ÓRDENES */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-800">
            No hay órdenes registradas con este filtro
          </p>
          <p className="text-xs text-slate-500">
            Crea una cotización o una orden de trabajo para comenzar.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const statusMeta = STATUS_LABELS[order.status];
            const waUrl = buildWhatsAppShareUrl({
              phone: order.clientPhone || activeBrand.phone,
              brandName: activeBrand.name,
              documentTitle:
                order.status === 'COTIZACION'
                  ? 'COTIZACIÓN'
                  : order.isFiscal
                  ? 'FACTURA FISCAL'
                  : 'ORDEN DE SERVICIO',
              documentCode:
                order.isFiscal && order.ncfNumber
                  ? order.ncfNumber
                  : order.orderCode,
              clientName: order.clientName,
              itemsSummary: order.items.map(
                (i) => `${i.quantity}x ${i.description}`
              ),
              totalAmount: order.totalAmount,
              amountPaid: order.amountPaid,
              balanceDue: order.balanceDue,
            });

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:border-slate-300 transition-all space-y-4"
              >
                {/* FILA SUPERIOR: CÓDIGO, CLIENTE, ESTADO Y TOTALES */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {order.orderCode}
                      </span>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>

                      {order.isFiscal && order.ncfNumber ? (
                        <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[11px] font-semibold">
                          NCF: {order.ncfNumber}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px]">
                          Recibo Interno
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-0.5">
                      <strong className="text-slate-900 font-semibold">
                        {order.clientName}
                      </strong>
                      {order.clientRncOrCedula && (
                        <span className="font-mono text-slate-500">
                          • RNC/Céd: {order.clientRncOrCedula}
                        </span>
                      )}
                      {order.clientPhone && (
                        <span className="font-mono text-slate-500">
                          • Tel: {order.clientPhone}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MONTOS: TOTAL ACORDADO, ABONADO Y BALANCE PENDIENTE */}
                  <div className="grid grid-cols-3 gap-4 bg-slate-50/80 px-4 py-2.5 rounded-xl border border-slate-200/70 shrink-0 text-right font-mono">
                    <div>
                      <span className="text-[10px] uppercase font-sans font-semibold text-slate-400 block">
                        Total Acordado
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        RD${' '}
                        {order.totalAmount.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-sans font-semibold text-teal-600 block">
                        Total Abonado
                      </span>
                      <span className="text-xs font-bold text-teal-700">
                        RD${' '}
                        {order.amountPaid.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-sans font-semibold text-amber-600 block">
                        Balance Pendiente
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          order.balanceDue > 0
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        RD${' '}
                        {order.balanceDue.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* DETALLE DE ÍTEMS Y FICHA DINÁMICA (ATELIER O TÉCNICA) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                  <div className="lg:col-span-6 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Servicios / Ítems
                    </span>
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-slate-700 py-0.5"
                      >
                        <span>
                          <strong className="font-mono">{item.quantity}x</strong>{' '}
                          {item.description}
                        </span>
                        <span className="font-mono font-medium text-slate-900">
                          RD${' '}
                          {(item.quantity * item.unitPrice).toLocaleString(
                            'es-DO',
                            { minimumFractionDigits: 2 }
                          )}
                        </span>
                      </div>
                    ))}

                    {order.payments.length > 0 && (
                      <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Historial de Abonos ({order.payments.length})
                        </span>
                        {order.payments.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-[11px] font-mono text-slate-500"
                          >
                            <span>
                              {new Date(p.date).toLocaleDateString('es-DO')} •{' '}
                              {p.method} ({p.note})
                            </span>
                            <span className="text-teal-700 font-semibold">
                              + RD${' '}
                              {p.amount.toLocaleString('es-DO', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN DINÁMICA SEGÚN LA MARCA ACTIVA */}
                  <div className="lg:col-span-6">
                    {order.atelierSpec ? (
                      <div className="rounded-xl bg-stone-50/80 border border-stone-200/80 p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-stone-800">
                            <Ruler className="w-3.5 h-3.5 text-amber-600" />
                            <span>Ficha de Medidas y Confección</span>
                          </span>
                          {order.atelierSpec.deliveryDate && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-stone-600">
                              <Calendar className="w-3 h-3" />
                              Entrega: {order.atelierSpec.deliveryDate}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 font-mono text-[11px] bg-white p-2 rounded-lg border border-stone-200/60">
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">
                              Busto
                            </span>
                            <strong>{order.atelierSpec.bust || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">
                              Cintura
                            </span>
                            <strong>{order.atelierSpec.waist || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">
                              Cadera
                            </span>
                            <strong>{order.atelierSpec.hips || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[9px] uppercase">
                              Largo
                            </span>
                            <strong>{order.atelierSpec.length || '—'}</strong>
                          </div>
                        </div>
                        {order.atelierSpec.fabricAndDesign && (
                          <p className="text-[11px] text-stone-700">
                            <span className="text-stone-400">Tela/Diseño: </span>
                            {order.atelierSpec.fabricAndDesign}
                          </p>
                        )}
                      </div>
                    ) : order.techSpec ? (
                      <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                            <Wrench className="w-3.5 h-3.5 text-teal-600" />
                            <span>Diagnóstico y Especificaciones Técnicas</span>
                          </span>
                          {order.techSpec.warrantyPeriod && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                              Garantía: {order.techSpec.warrantyPeriod}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-700">
                          <span className="text-slate-400">Equipo/Área: </span>
                          <strong className="text-slate-900">
                            {order.techSpec.equipmentOrArea || '—'}
                          </strong>
                          {order.techSpec.serialOrModel && (
                            <span className="font-mono text-slate-500">
                              {' '}
                              ({order.techSpec.serialOrModel})
                            </span>
                          )}
                        </div>
                        {order.techSpec.diagnosisAndWork && (
                          <p className="text-[11px] text-slate-600">
                            {order.techSpec.diagnosisAndWork}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* BARRA INFERIOR: FLUJO DE ESTADOS + BOTONES DE ABONO E IMPRESIÓN */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  {/* CAMBIO DE ESTADO O CONVERSIÓN DE COTIZACIÓN */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {order.status === 'COTIZACION' ? (
                      <button
                        type="button"
                        onClick={() => handleConvertQuoteToOrder(order)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition-colors"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Convertir en Orden de Trabajo</span>
                      </button>
                    ) : (
                      WORKFLOW_STATUSES.map((st) => {
                        const active = order.status === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleChangeOrderStatus(order, st)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                              active
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {STATUS_LABELS[st].label}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* ACCIONES: REGISTRAR ABONO / EMITIR NCF / IMPRIMIR / WHATSAPP */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenPaymentModal(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-teal-400" />
                      <span>
                        {order.balanceDue > 0
                          ? 'Registrar Abono / Facturar'
                          : !order.isFiscal
                          ? 'Emitir Factura NCF'
                          : 'Ver Pagos'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openPrintForOrder(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir / PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openPrintForOrder(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Enviar PNG / PDF por WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==========================================
         MODAL 1: CREAR NUEVA COTIZACIÓN U ORDEN DE SERVICIO
         ========================================== */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-slate-900">
                  {createKind === 'QUOTE'
                    ? 'Nueva Cotización'
                    : isAtelier
                    ? 'Nueva Orden de Confección (Atelier)'
                    : 'Nueva Orden de Servicio'}
                </h3>
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setCreateKind('ORDER')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                      createKind === 'ORDER'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Orden
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateKind('QUOTE')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                      createKind === 'QUOTE'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Cotización
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveNewOrder}
              className="p-6 overflow-y-auto space-y-5 text-xs"
            >
              {/* SELECCIÓN DE CLIENTE */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-4">
                  <label className="font-semibold text-slate-700 block mb-1">
                    Seleccionar Cliente Frecuente (Opcional)
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => handleSelectClient(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-slate-50"
                  >
                    <option value="">-- Nuevo cliente o escribir abajo --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="font-medium text-slate-600 block mb-1">
                    Nombre / Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ej. Dra. Carolina Méndez"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    RNC / Cédula
                  </label>
                  <input
                    type="text"
                    value={clientRnc}
                    onChange={(e) => setClientRnc(e.target.value)}
                    placeholder="Opcional"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Teléfono (WhatsApp)
                  </label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="809-000-0000"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
                  />
                </div>
              </div>

              {/* CAMPOS DINÁMICOS: ATELIER VS TÉCNICO */}
              {isAtelier ? (
                <div className="rounded-xl bg-stone-50 border border-stone-200 p-4 space-y-3">
                  <div className="font-bold text-stone-800 flex items-center gap-1.5">
                    <Ruler className="w-4 h-4 text-amber-600" />
                    <span>Ficha de Medidas y Confección (Atelier)</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">
                        Busto
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 92 cm"
                        value={atelierSpec.bust}
                        onChange={(e) =>
                          setAtelierSpec({ ...atelierSpec, bust: e.target.value })
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">
                        Cintura
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 70 cm"
                        value={atelierSpec.waist}
                        onChange={(e) =>
                          setAtelierSpec({
                            ...atelierSpec,
                            waist: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">
                        Cadera
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 98 cm"
                        value={atelierSpec.hips}
                        onChange={(e) =>
                          setAtelierSpec({ ...atelierSpec, hips: e.target.value })
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">
                        Largo
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 148 cm"
                        value={atelierSpec.length}
                        onChange={(e) =>
                          setAtelierSpec({
                            ...atelierSpec,
                            length: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-1">
                      <label className="text-[11px] text-stone-500 block mb-1">
                        Tipo de Tela y Diseño
                      </label>
                      <input
                        type="text"
                        placeholder="Seda, encaje, color..."
                        value={atelierSpec.fabricAndDesign}
                        onChange={(e) =>
                          setAtelierSpec({
                            ...atelierSpec,
                            fabricAndDesign: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">
                        Fecha de Prueba
                      </label>
                      <input
                        type="date"
                        value={atelierSpec.fittingDate}
                        onChange={(e) =>
                          setAtelierSpec({
                            ...atelierSpec,
                            fittingDate: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-stone-500 block mb-1">
                        Fecha de Entrega
                      </label>
                      <input
                        type="date"
                        value={atelierSpec.deliveryDate}
                        onChange={(e) =>
                          setAtelierSpec({
                            ...atelierSpec,
                            deliveryDate: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-teal-600" />
                    <span>Diagnóstico y Especificaciones Técnicas</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">
                        Equipo / Área a Intervenir
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. A/C Split 24,000 BTU o Red Piso 2"
                        value={techSpec.equipmentOrArea}
                        onChange={(e) =>
                          setTechSpec({
                            ...techSpec,
                            equipmentOrArea: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">
                        Serial / Modelo
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Carrier Inverter / UniFi Pro"
                        value={techSpec.serialOrModel}
                        onChange={(e) =>
                          setTechSpec({
                            ...techSpec,
                            serialOrModel: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-1">
                      <label className="text-[11px] text-slate-500 block mb-1">
                        Trabajo a Realizar
                      </label>
                      <input
                        type="text"
                        placeholder="Detalle técnico..."
                        value={techSpec.diagnosisAndWork}
                        onChange={(e) =>
                          setTechSpec({
                            ...techSpec,
                            diagnosisAndWork: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">
                        Garantía
                      </label>
                      <input
                        type="text"
                        value={techSpec.warrantyPeriod}
                        onChange={(e) =>
                          setTechSpec({
                            ...techSpec,
                            warrantyPeriod: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">
                        Fecha de Entrega
                      </label>
                      <input
                        type="date"
                        value={techSpec.deliveryDate}
                        onChange={(e) =>
                          setTechSpec({
                            ...techSpec,
                            deliveryDate: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ÍTEMS DE LA ORDEN + BOTONES RÁPIDOS DEL CATÁLOGO */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-semibold text-slate-700">
                    Servicios / Ítems a Facturar
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {brandCatalog.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleAddCatalogItemToForm(cat)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors"
                      >
                        + {cat.name.slice(0, 28)}...
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {formItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-2 items-center"
                    >
                      <input
                        type="text"
                        placeholder="Descripción del servicio o producto"
                        value={item.description}
                        onChange={(e) =>
                          handleUpdateFormItem(
                            item.id,
                            'description',
                            e.target.value
                          )
                        }
                        className="col-span-6 rounded-xl border border-slate-200 px-3 py-1.5"
                      />
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateFormItem(
                            item.id,
                            'quantity',
                            Number(e.target.value)
                          )
                        }
                        className="col-span-2 rounded-xl border border-slate-200 px-2.5 py-1.5 font-mono text-center"
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleUpdateFormItem(
                            item.id,
                            'unitPrice',
                            Number(e.target.value)
                          )
                        }
                        className="col-span-3 rounded-xl border border-slate-200 px-2.5 py-1.5 font-mono text-right"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFormItem(item.id)}
                        className="col-span-1 p-1.5 text-slate-400 hover:text-rose-600 flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ABONO INICIAL (SI ES ORDEN) */}
              {createKind === 'ORDER' && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      Abono Inicial al Ordenar
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      Total Acordado: RD${' '}
                      {formSubtotal.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: '50_PERCENT', label: '50% Inicial' },
                        { id: 'FULL', label: '100% Pago Total' },
                        { id: 'CUSTOM', label: 'Monto Personalizado' },
                        { id: 'NONE', label: 'Sin Abono (RD$ 0)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setInitialPaymentMode(opt.id)}
                        className={`py-2 px-2.5 rounded-xl font-semibold border text-xs transition-all ${
                          initialPaymentMode === opt.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {initialPaymentMode === 'CUSTOM' && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">
                          Monto Abonado (RD$)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={formSubtotal}
                          value={customInitialAmount}
                          onChange={(e) =>
                            setCustomInitialAmount(Number(e.target.value))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {computedInitialDeposit > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Método:</span>
                        <select
                          value={paymentMethod}
                          onChange={(e) =>
                            setPaymentMethod(e.target.value as PaymentMethod)
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium"
                        >
                          <option value="TRANSFERENCIA">Transferencia</option>
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="TARJETA">Tarjeta</option>
                        </select>
                      </div>

                      <div className="font-mono space-x-3">
                        <span className="text-teal-700 font-semibold">
                          Abono: RD${' '}
                          {computedInitialDeposit.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <span className="text-slate-700 font-bold">
                          Resta: RD${' '}
                          {(
                            formSubtotal - computedInitialDeposit
                          ).toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                >
                  {createKind === 'QUOTE'
                    ? 'Guardar e Imprimir Cotización'
                    : 'Guardar Orden y Emitir Recibo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
         MODAL 2: REGISTRAR ABONO / SALDO O EMITIR FACTURA FISCAL (NCF)
         ========================================== */}
      {paymentOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Cobro y Facturación • {paymentOrder.orderCode}
                </h3>
                <p className="text-xs text-slate-500">
                  {paymentOrder.clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmOrderPayment}
              className="p-6 space-y-4 text-xs"
            >
              {/* RESUMEN DE SALDO ACTUAL */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/80 font-mono text-center">
                <div>
                  <span className="text-[10px] text-slate-400 font-sans block">
                    Acordado
                  </span>
                  <strong className="text-slate-900">
                    RD$ {paymentOrder.totalAmount.toLocaleString('es-DO')}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-teal-600 font-sans block">
                    Abonado
                  </span>
                  <strong className="text-teal-700">
                    RD$ {paymentOrder.amountPaid.toLocaleString('es-DO')}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-amber-600 font-sans block">
                    Pendiente
                  </span>
                  <strong className="text-amber-700">
                    RD$ {paymentOrder.balanceDue.toLocaleString('es-DO')}
                  </strong>
                </div>
              </div>

              {/* SELECTOR DE MODO DUAL: RECIBO INTERNO VS FACTURA FISCAL (NCF) */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Tipo de Comprobante a Emitir
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setPayDocMode('INTERNAL')}
                    className={`py-2 px-3 rounded-lg font-semibold transition-all ${
                      payDocMode === 'INTERNAL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Recibo de Abono Interno
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayDocMode('FISCAL')}
                    className={`py-2 px-3 rounded-lg font-semibold transition-all ${
                      payDocMode === 'FISCAL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Factura Fiscal (NCF)
                  </button>
                </div>
              </div>

              {payDocMode === 'FISCAL' && !paymentOrder.isFiscal && (
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Serie NCF a Consumir
                  </label>
                  <select
                    value={payNcfType}
                    onChange={(e) =>
                      setPayNcfType(e.target.value as 'B01' | 'B02')
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white font-mono"
                  >
                    <option value="B01">
                      B01 • Factura de Crédito Fiscal (+18% ITBIS)
                    </option>
                    <option value="B02">
                      B02 • Factura de Consumo (+18% ITBIS)
                    </option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Monto a Abonar Hoy (RD$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Método de Pago
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) =>
                      setPayMethod(e.target.value as PaymentMethod)
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                  >
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                </div>
              </div>

              {/* BOTONES RÁPIDOS DE MONTO */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPayAmount(roundCurrency(paymentOrder.totalAmount * 0.5))
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px]"
                >
                  50% (RD${' '}
                  {roundCurrency(
                    paymentOrder.totalAmount * 0.5
                  ).toLocaleString('es-DO')}
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setPayAmount(paymentOrder.balanceDue)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px]"
                >
                  Saldar Total (RD${' '}
                  {paymentOrder.balanceDue.toLocaleString('es-DO')})
                </button>
              </div>

              <div>
                <label className="font-medium text-slate-600 block mb-1">
                  Concepto / Nota del Pago
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPaymentOrder(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                >
                  Confirmar e Imprimir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE IMPRESIÓN DUAL (A4 / 80MM + WHATSAPP) */}
      <InvoicePrintModal
        data={printData}
        onClose={() => setPrintData(null)}
      />
    </div>
  );
};
