import React, { useState } from 'react';
import {
  Barcode,
  Check,
  CreditCard,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  User,
} from 'lucide-react';
import {
  db,
  type BrandProfile,
  type CatalogItem,
  type ClientProfile,
  type CorporateConfig,
  type InvoiceItem,
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

  const totals = calculateInvoiceTotals(cart, {
    isFiscal,
    includeLegalTip: false,
    depositPercentage: 100,
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

    try {
      const emittedDoc = await issueDocumentTransaction({
        brandId: activeBrand.id,
        moduleUsed: 'RETAIL_MODULE',
        isFiscal,
        ncfType: isFiscal ? ncfType : undefined,
        internalDocTitle: 'RECIBO_DE_PAGO',
        customerName: customerName.trim() || 'Consumidor Final',
        customerRncOrCedula: isFiscal ? customerRnc.trim() : undefined,
        items: cart,
        includeLegalTip: false,
        depositPercentage: 100,
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
      showToast(`Venta completada: ${emittedDoc.documentCode}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al procesar el cobro.';
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

      {/* COLUMNA IZQUIERDA (7 COLS): REJILLA DE PRODUCTOS Y BUSCADOR DE CÓDIGO DE BARRAS */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
          <div className="relative">
            <Barcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Escanear código de barras o buscar equipo/producto (Enter para agregar)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-slate-900"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
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

        {/* REJILLA DE PRODUCTOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
      </div>

      {/* COLUMNA DERECHA (5 COLS): CARRITO Y TERMINAL DE COBRO */}
      <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-slate-900" />
            <h3 className="text-sm font-bold text-slate-900">
              Ticket de Venta ({cart.reduce((a, b) => a + b.quantity, 0)})
            </h3>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
            >
              Vaciar
            </button>
          )}
        </div>

        {/* LISTA DE ÍTEMS EN EL CARRITO */}
        <div className="p-4 space-y-2.5 max-h-64 overflow-y-auto divide-y divide-slate-100">
          {cart.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Package className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-400">
                Selecciona equipos o servicios de la rejilla para facturar.
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="pt-2.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">
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
                  </div>
                </div>

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
                  {(item.quantity * item.unitPrice).toLocaleString('es-DO', {
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
            ))
          )}
        </div>

        {/* CONFIGURACIÓN DE CLIENTE, MODO FISCAL Y MÉTODO DE COBRO */}
        <div className="p-5 bg-slate-50/70 border-t border-slate-200 space-y-4 text-xs">
          {/* SELECTOR DE CLIENTE */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <User className="w-3.5 h-3.5" />
              <span>Cliente</span>
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
                  placeholder="RNC o Cédula"
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

          {/* MÉTODO DE COBRO */}
          <div className="space-y-1.5">
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
              <div className="grid grid-cols-2 gap-2 pt-1">
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
            )}
          </div>

          {/* RESUMEN DE TOTALES */}
          <div className="pt-3 border-t border-slate-200 space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
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

      {/* MODAL DE IMPRESIÓN Y WHATSAPP */}
      <InvoicePrintModal
        data={printData}
        onClose={() => setPrintData(null)}
      />
    </div>
  );
};
