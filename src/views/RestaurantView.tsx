import React, { useState } from 'react';
import {
  Check,
  CreditCard,
  FileText,
  Minus,
  Plus,
  Printer,
  Split,
  Trash2,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import {
  db,
  type BrandProfile,
  type CatalogItem,
  type CorporateConfig,
  type InvoiceItem,
  type NCFSequence,
  type PaymentMethod,
  type RestaurantTableAccount,
  type RestaurantZone,
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

interface RestaurantViewProps {
  activeBrand: BrandProfile;
  corporate: CorporateConfig;
  ncfSequences: NCFSequence[];
  tables: RestaurantTableAccount[];
  catalogItems: CatalogItem[];
}

const ZONE_LABELS: Record<RestaurantZone | 'ALL', string> = {
  ALL: 'Todas las Zonas',
  SALON: 'Salón Principal',
  TERRAZA: 'Terraza',
  VIP: 'Reservado VIP',
  EVENTOS: 'Fast-Food / Eventos',
};

export const RestaurantView: React.FC<RestaurantViewProps> = ({
  activeBrand,
  corporate,
  ncfSequences,
  tables,
  catalogItems,
}) => {
  const [selectedZone, setSelectedZone] = useState<RestaurantZone | 'ALL'>(
    'ALL'
  );
  const [selectedTableId, setSelectedTableId] = useState<string>(
    tables[0]?.id || 'mesa-01'
  );

  // Configuración de cobro de la mesa
  const [isFiscal, setIsFiscal] = useState<boolean>(false);
  const [ncfType, setNcfType] = useState<'B01' | 'B02'>('B02');
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('TARJETA');
  const [toast, setToast] = useState<string | null>(null);
  const [printData, setPrintData] = useState<PrintableDocumentData | null>(
    null
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const activeTable =
    tables.find((t) => t.id === selectedTableId) || tables[0];

  // Platos y bebidas de Metro Food Station (o de la unidad activa)
  const menuItems = catalogItems.filter(
    (item) =>
      (item.brandId === 'metro-food' || item.brandId === activeBrand.id) &&
      item.active
  );

  const filteredTables = tables.filter(
    (t) => selectedZone === 'ALL' || t.zone === selectedZone
  );

  // Actualizar estado persistente de la mesa en Dexie
  const updateTableInDb = async (updated: RestaurantTableAccount) => {
    await db.restaurantTables.put(updated);
  };

  // Agregar plato o bebida a la mesa seleccionada
  const handleAddDishToTable = async (dish: CatalogItem) => {
    if (!activeTable) return;

    const existing = activeTable.items.find((i) => i.code === dish.code);
    let updatedItems: InvoiceItem[];

    if (existing) {
      updatedItems = activeTable.items.map((i) =>
        i.code === dish.code ? { ...i, quantity: i.quantity + 1 } : i
      );
    } else {
      updatedItems = [
        ...activeTable.items,
        {
          id: `${dish.code}-${Date.now()}`,
          code: dish.code,
          description: dish.name,
          quantity: 1,
          unit: dish.unit || 'ORD',
          unitPrice: dish.price,
        },
      ];
    }

    await updateTableInDb({
      ...activeTable,
      status: activeTable.status === 'LIBRE' ? 'OCUPADA' : activeTable.status,
      openedAt: activeTable.openedAt || new Date().toISOString(),
      items: updatedItems,
    });
  };

  const handleUpdateDishQty = async (itemId: string, delta: number) => {
    if (!activeTable) return;
    const updatedItems = activeTable.items
      .map((item) => {
        if (item.id !== itemId) return item;
        const next = item.quantity + delta;
        return next > 0 ? { ...item, quantity: next } : null;
      })
      .filter((x): x is InvoiceItem => x !== null);

    await updateTableInDb({
      ...activeTable,
      status: updatedItems.length === 0 ? 'LIBRE' : activeTable.status,
      items: updatedItems,
    });
  };

  const handleRemoveDish = async (itemId: string) => {
    if (!activeTable) return;
    const updatedItems = activeTable.items.filter((i) => i.id !== itemId);
    await updateTableInDb({
      ...activeTable,
      status: updatedItems.length === 0 ? 'LIBRE' : activeTable.status,
      items: updatedItems,
    });
  };

  const handleToggleLegalTip = async (checked: boolean) => {
    if (!activeTable) return;
    await updateTableInDb({
      ...activeTable,
      includeLegalTip: checked,
    });
  };

  const handleChangeSplitWays = async (ways: number) => {
    if (!activeTable) return;
    const clamped = Math.max(1, Math.min(20, ways));
    await updateTableInDb({
      ...activeTable,
      splitWays: clamped,
      guests: Math.max(activeTable.guests, clamped),
    });
  };

  const handleUpdateClientMeta = async (
    field: 'clientName' | 'clientRncOrCedula' | 'guests',
    value: string | number
  ) => {
    if (!activeTable) return;
    await updateTableInDb({
      ...activeTable,
      [field]: value,
    });
  };

  // Cálculo fiscal con 10% Propina Legal obligatoria sobre el subtotal neto antes de ITBIS
  const tableTotals = activeTable
    ? calculateInvoiceTotals(activeTable.items, {
        isFiscal,
        includeLegalTip: activeTable.includeLegalTip,
        depositPercentage: 100,
      })
    : calculateInvoiceTotals([], { isFiscal: false });

  const splitWays = activeTable?.splitWays || 1;
  const amountPerPerson =
    splitWays > 1
      ? roundCurrency(tableTotals.totalAmount / splitWays)
      : tableTotals.totalAmount;

  // Emitir Pre-Cuenta (sin cerrar mesa ni consumir NCF)
  const handlePrintPreCheck = async () => {
    if (!activeTable || activeTable.items.length === 0) {
      showToast('La mesa no tiene consumos registrados.');
      return;
    }

    await updateTableInDb({
      ...activeTable,
      status: 'PRE_CUENTA',
    });

    setPrintData({
      isFiscal: false,
      brand: activeBrand,
      corporate,
      documentCode: `PRE-${activeTable.name.replace(/\s+/g, '')}`,
      internalDocTitle: 'ORDEN_DE_SERVICIO',
      clientName: `${activeTable.clientName} (${activeTable.name})`,
      clientRncOrCedula: activeTable.clientRncOrCedula,
      createdAt: new Date().toISOString(),
      items: activeTable.items,
      subtotal: tableTotals.netSubtotal,
      itbisAmount: tableTotals.itbisAmount,
      legalTipAmount: tableTotals.legalTipAmount,
      totalAmount: tableTotals.totalAmount,
      amountPaid: 0,
      balanceDue: tableTotals.totalAmount,
      notes:
        splitWays > 1
          ? `PRE-CUENTA • Dividida entre ${splitWays} personas: RD$ ${amountPerPerson.toLocaleString(
              'es-DO',
              { minimumFractionDigits: 2 }
            )} c/u`
          : 'PRE-CUENTA DE MESA',
    });

    showToast(`Pre-Cuenta generada para ${activeTable.name}`);
  };

  // Cerrar y Cobrar Cuenta de Mesa (Total o Split Bill)
  const handleCloseAndChargeTable = async () => {
    if (!activeTable || activeTable.items.length === 0) {
      showToast('Agregue platos a la mesa antes de cobrar.');
      return;
    }

    try {
      const emittedDoc = await issueDocumentTransaction({
        brandId: activeBrand.id,
        moduleUsed: 'RESTAURANT_MODULE',
        isFiscal,
        ncfType: isFiscal ? ncfType : undefined,
        internalDocTitle: 'RECIBO_DE_PAGO',
        customerName:
          activeTable.clientName.trim() || `Cliente ${activeTable.name}`,
        customerRncOrCedula: isFiscal
          ? activeTable.clientRncOrCedula.trim()
          : undefined,
        items: activeTable.items,
        includeLegalTip: activeTable.includeLegalTip,
        depositPercentage: 100,
      });

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
        createdAt: emittedDoc.createdAt,
        items: emittedDoc.items,
        subtotal: emittedDoc.subtotal,
        itbisAmount: emittedDoc.itbisAmount,
        legalTipAmount: emittedDoc.legalTipAmount,
        totalAmount: emittedDoc.totalAmount,
        amountPaid: emittedDoc.totalAmount,
        balanceDue: 0,
        notes:
          splitWays > 1
            ? `${activeTable.name} • Split Bill (${splitWays} comensales): RD$ ${amountPerPerson.toLocaleString(
                'es-DO',
                { minimumFractionDigits: 2 }
              )} por persona`
            : `${activeTable.name} • Pago ${paymentMethod}`,
      });

      // Liberar mesa en Dexie
      await updateTableInDb({
        ...activeTable,
        status: 'LIBRE',
        clientName: 'Consumidor Final',
        clientRncOrCedula: '',
        splitWays: 1,
        items: [],
        openedAt: undefined,
      });

      showToast(
        `Cuenta de ${activeTable.name} cerrada (${emittedDoc.documentCode}).`
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al cerrar la cuenta.';
      showToast(msg);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          <Check className="w-4 h-4 text-teal-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* COLUMNA IZQUIERDA (7 COLS): MAPA DE MESAS INTERACTIVO + CARTA RÁPIDA */}
      <div className="lg:col-span-7 space-y-6">
        {/* FILTRO DE ZONAS Y MAPA DE MESAS */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-orange-500" />
              <span>Mapa de Mesas y Zonas</span>
            </h3>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                ['ALL', 'SALON', 'TERRAZA', 'VIP', 'EVENTOS'] as const
              ).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setSelectedZone(z)}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                    selectedZone === z
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {ZONE_LABELS[z]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {filteredTables.map((table) => {
              const isSelected = activeTable?.id === table.id;
              const tTotals = calculateInvoiceTotals(table.items, {
                isFiscal: false,
                includeLegalTip: table.includeLegalTip,
              });

              const statusStyles = {
                LIBRE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                OCUPADA: 'bg-orange-50 text-orange-700 border-orange-200',
                PRE_CUENTA: 'bg-amber-50 text-amber-800 border-amber-200',
              }[table.status];

              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setSelectedTableId(table.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between h-32 ${
                    isSelected
                      ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50/70'
                      : 'border-slate-200/90 hover:border-slate-400 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-slate-900">
                        {table.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusStyles}`}
                      >
                        {table.status === 'LIBRE'
                          ? 'Libre'
                          : table.status === 'OCUPADA'
                          ? 'Ocupada'
                          : 'Pre-Cuenta'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {ZONE_LABELS[table.zone]} • {table.capacity} pax
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                      <Users className="w-3 h-3" />
                      {table.guests}
                    </span>
                    <span className="font-mono font-bold text-xs text-slate-900">
                      {table.items.length > 0
                        ? `RD$ ${tTotals.totalAmount.toLocaleString('es-DO')}`
                        : 'RD$ 0'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ADICIÓN RÁPIDA DE PLATOS, COMBOS Y BEBIDAS */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Menú Rápido • Agregar a {activeTable?.name}
            </h4>
            <span className="text-xs text-slate-400">
              Haz clic para comandar a la mesa
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {menuItems.map((dish) => (
              <button
                key={dish.id || dish.code}
                type="button"
                onClick={() => handleAddDishToTable(dish)}
                className="p-3.5 rounded-xl border border-slate-200/90 hover:border-slate-900 bg-white text-left flex items-center justify-between gap-3 transition-all"
              >
                <div className="min-w-0">
                  <span className="text-[10px] font-mono text-slate-400 block">
                    {dish.category}
                  </span>
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {dish.name}
                  </p>
                </div>
                <span className="font-mono font-bold text-xs text-slate-900 shrink-0">
                  RD$ {dish.price.toLocaleString('es-DO')}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* COLUMNA DERECHA (5 COLS): CUENTA DE MESA, PROPINA 10% Y SPLIT BILL */}
      {activeTable && (
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Cuenta • {activeTable.name}
              </h3>
              <p className="text-[11px] text-slate-500">
                {ZONE_LABELS[activeTable.zone]} • Camarero:{' '}
                {activeTable.waiterName}
              </p>
            </div>

            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
              {activeTable.items.reduce((a, b) => a + b.quantity, 0)} ítems
            </span>
          </div>

          {/* DETALLE DE PLATOS COMANDADOS */}
          <div className="p-4 space-y-2.5 max-h-60 overflow-y-auto divide-y divide-slate-100">
            {activeTable.items.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Mesa libre. Selecciona platos del menú para abrir la cuenta.
              </div>
            ) : (
              activeTable.items.map((item) => (
                <div
                  key={item.id}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">
                      {item.description}
                    </p>
                    <span className="text-[11px] font-mono text-slate-400">
                      RD$ {item.unitPrice.toLocaleString('es-DO')} c/u
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUpdateDishQty(item.id, -1)}
                      className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center font-mono font-bold">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateDishQty(item.id, 1)}
                      className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="w-20 text-right font-mono font-bold text-slate-900 shrink-0">
                    RD${' '}
                    {(item.quantity * item.unitPrice).toLocaleString('es-DO')}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveDish(item.id)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* SECCIÓN DE SPLIT BILL, PROPINA LEGAL 10% Y MODO FISCAL */}
          <div className="p-5 bg-slate-50/70 border-t border-slate-200 space-y-4 text-xs">
            {/* FUNCIÓN SPLIT BILL (DIVIDIR CUENTA POR COMENSALES) */}
            <div className="rounded-xl bg-white border border-slate-200 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Split className="w-3.5 h-3.5 text-orange-500" />
                  <span>Dividir Cuenta (Split Bill)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {splitWays === 1
                    ? '1 sola cuenta'
                    : `${splitWays} partes iguales`}
                </span>
              </div>

              <div className="grid grid-cols-6 gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleChangeSplitWays(n)}
                    className={`py-1.5 rounded-lg font-mono font-bold text-xs border transition-all ${
                      splitWays === n
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>

              {splitWays > 1 && tableTotals.totalAmount > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-mono">
                  <span className="text-slate-600 font-sans">
                    Monto por comensal ({splitWays} pax):
                  </span>
                  <strong className="text-sm text-orange-600">
                    RD${' '}
                    {amountPerPerson.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </strong>
                </div>
              )}
            </div>

            {/* 10% PROPINA LEGAL OBLIGATORIA */}
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="font-semibold text-slate-800 block">
                  10% Propina Legal Obligatoria (RD)
                </span>
                <span className="text-[11px] text-slate-400">
                  Calculada sobre el subtotal neto antes de ITBIS
                </span>
              </div>
              <input
                type="checkbox"
                checked={activeTable.includeLegalTip}
                onChange={(e) => handleToggleLegalTip(e.target.checked)}
                className="w-4 h-4 accent-slate-900 rounded cursor-pointer"
              />
            </div>

            {/* SELECTOR DE MODO DUAL */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-200/70">
                <button
                  type="button"
                  onClick={() => setIsFiscal(false)}
                  className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
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
                  className={`py-1.5 px-3 rounded-lg font-semibold transition-all ${
                    isFiscal
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  Factura Fiscal (NCF)
                </button>
              </div>

              {isFiscal && (
                <div className="space-y-2 pt-1">
                  <select
                    value={ncfType}
                    onChange={(e) => setNcfType(e.target.value as 'B01' | 'B02')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-mono"
                  >
                    <option value="B01">B01 • Crédito Fiscal</option>
                    <option value="B02">B02 • Factura de Consumo</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Cliente / Empresa"
                      value={activeTable.clientName}
                      onChange={(e) =>
                        handleUpdateClientMeta('clientName', e.target.value)
                      }
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5"
                    />
                    <input
                      type="text"
                      placeholder="RNC / Cédula"
                      value={activeTable.clientRncOrCedula}
                      onChange={(e) =>
                        handleUpdateClientMeta(
                          'clientRncOrCedula',
                          e.target.value
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* MÉTODO DE PAGO */}
            <div className="grid grid-cols-3 gap-2">
              {(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`py-1.5 rounded-xl font-semibold border text-xs ${
                    paymentMethod === m
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {m === 'EFECTIVO'
                    ? 'Efectivo'
                    : m === 'TARJETA'
                    ? 'Tarjeta'
                    : 'Transferencia'}
                </button>
              ))}
            </div>

            {/* DESGLOSE DE TOTALES DE LA MESA */}
            <div className="pt-3 border-t border-slate-200 space-y-1.5 font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal Neto:</span>
                <span>
                  RD${' '}
                  {tableTotals.netSubtotal.toLocaleString('es-DO', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              {activeTable.includeLegalTip && (
                <div className="flex justify-between text-slate-700">
                  <span>10% Propina Legal:</span>
                  <span>
                    RD${' '}
                    {tableTotals.legalTipAmount.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}

              {isFiscal && (
                <div className="flex justify-between text-slate-800">
                  <span>18% ITBIS:</span>
                  <span>
                    RD${' '}
                    {tableTotals.itbisAmount.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-2 border-t border-slate-200">
                <span>TOTAL CUENTA:</span>
                <span>
                  RD${' '}
                  {tableTotals.totalAmount.toLocaleString('es-DO', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {/* BOTONES DE PRE-CUENTA Y COBRO FINAL */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handlePrintPreCheck}
                className="py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Pre-Cuenta</span>
              </button>

              <button
                type="button"
                onClick={handleCloseAndChargeTable}
                className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5 text-teal-400" />
                <span>Cobrar Cuenta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE IMPRESIÓN */}
      <InvoicePrintModal
        data={printData}
        onClose={() => setPrintData(null)}
      />
    </div>
  );
};
