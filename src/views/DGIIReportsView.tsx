import React, { useState } from 'react';
import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  X,
} from 'lucide-react';
import {
  db,
  type BrandProfile,
  type CorporateConfig,
  type IssuedDocument,
  type NCFSequence,
} from '../db/db';
import {
  calculateB11Retentions,
  consumeNextNCF,
  roundCurrency,
  type B11RetentionCategory,
} from '../services/fiscalService';
import {
  InvoicePrintModal,
  type PrintableDocumentData,
} from '../components/InvoicePrintModal';

interface DGIIReportsViewProps {
  corporate: CorporateConfig;
  activeBrand: BrandProfile;
  ncfSequences: NCFSequence[];
  documents: IssuedDocument[];
}

export const DGIIReportsView: React.FC<DGIIReportsViewProps> = ({
  corporate,
  activeBrand,
  ncfSequences,
  documents,
}) => {
  const [activeReport, setActiveReport] = useState<'607' | '606'>('607');
  const [periodMonth, setPeriodMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
  });
  const [toast, setToast] = useState<string | null>(null);
  const [printData, setPrintData] = useState<PrintableDocumentData | null>(
    null
  );

  // Modal para registrar Compra Informal B11 o Gasto Menor B13 (Formato 606)
  const [modal606Open, setModal606Open] = useState<boolean>(false);
  const [purchaseNcfType, setPurchaseNcfType] = useState<'B11' | 'B13'>('B11');
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierRncOrCedula, setSupplierRncOrCedula] = useState<string>('');
  const [purchaseConcept, setPurchaseConcept] = useState<string>('');
  const [purchaseAmount, setPurchaseAmount] = useState<number>(5000);
  const [retentionCategory, setRetentionCategory] =
    useState<B11RetentionCategory>('SERVICIO_TECNICO_2');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Documentos que van al 607 (Ventas Fiscales B01, B02, B04)
  const sales607 = documents.filter((d) => d.isFiscal && d.goesTo607);
  // Ventas internas (Recibos Internos) que NO van al 607
  const internalSales = documents.filter((d) => !d.isFiscal);
  // Documentos que van al 606 (Compras B11 y Gastos Menores B13)
  const purchases606 = documents.filter((d) => d.isFiscal && d.goesTo606);

  const total607Subtotal = sales607.reduce((a, b) => a + b.subtotal, 0);
  const total607Itbis = sales607.reduce((a, b) => a + b.itbisAmount, 0);
  const total607Tip = sales607.reduce((a, b) => a + (b.legalTipAmount || 0), 0);
  const total607General = sales607.reduce((a, b) => a + b.totalAmount, 0);

  const total606Subtotal = purchases606.reduce((a, b) => a + b.subtotal, 0);
  const total606Itbis = purchases606.reduce((a, b) => a + b.itbisAmount, 0);
  const total606RetainedItbis = purchases606.reduce(
    (a, b) => a + (b.itbisRetentionAmount || 0),
    0
  );
  const total606RetainedIsr = purchases606.reduce(
    (a, b) => a + (b.isrRetentionAmount || 0),
    0
  );

  const formatDgiiDate = (iso: string) => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const getTaxIdType = (rncOrCed?: string) => {
    const clean = (rncOrCed || '').replace(/\D/g, '');
    if (clean.length === 9) return '1'; // RNC
    if (clean.length === 11) return '2'; // Cédula
    return '3'; // Consumidor final / Pasaporte
  };

  // Descargar archivo de texto o CSV
  const downloadFile = (
    filename: string,
    content: string,
    mimeType = 'text/plain;charset=utf-8'
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Exportar Formato 607 Oficial DGII (.TXT pipe-delimited)
  const handleExport607Txt = () => {
    const headerLine = `607|${corporate.rnc}|${periodMonth}|${sales607.length}`;
    const rows = sales607.map((doc) => {
      const cleanId = (doc.customerRncOrCedula || '').replace(/\D/g, '');
      const idType = getTaxIdType(cleanId);
      const dateStr = formatDgiiDate(doc.createdAt);
      return [
        cleanId,
        idType,
        doc.ncfNumber || doc.documentCode,
        '', // NCF modificado
        '01', // Ingresos por operaciones
        dateStr,
        '', // Fecha retención
        doc.subtotal.toFixed(2),
        doc.itbisAmount.toFixed(2),
        '0.00', // ITBIS retenido por terceros
        '0.00', // ITBIS percibido
        '0.00', // Retención renta
        '0.00', // ISR percibido
        '0.00', // Impuesto selectivo
        '0.00', // Otros impuestos
        (doc.legalTipAmount || 0).toFixed(2), // Propina legal 10%
      ].join('|');
    });

    const content = [headerLine, ...rows].join('\r\n');
    const filename = `DGII_F_607_${corporate.rnc}_${periodMonth}.txt`;
    downloadFile(filename, content);
    showToast(`Archivo oficial ${filename} exportado.`);
  };

  // Exportar Formato 607 en CSV para Excel
  const handleExport607Csv = () => {
    const headers = [
      'RNC_Cedula',
      'Tipo_ID',
      'NCF',
      'Cliente',
      'Unidad_Negocio',
      'Fecha_Comprobante',
      'Subtotal_Facturado',
      'ITBIS_18',
      'Propina_Legal_10',
      'Total_Facturado',
    ].join(',');

    const rows = sales607.map((doc) =>
      [
        `"${doc.customerRncOrCedula || ''}"`,
        getTaxIdType(doc.customerRncOrCedula),
        `"${doc.ncfNumber || doc.documentCode}"`,
        `"${doc.customerName.replace(/"/g, '""')}"`,
        `"${doc.brandName}"`,
        formatDgiiDate(doc.createdAt),
        doc.subtotal.toFixed(2),
        doc.itbisAmount.toFixed(2),
        (doc.legalTipAmount || 0).toFixed(2),
        doc.totalAmount.toFixed(2),
      ].join(',')
    );

    const content = [headers, ...rows].join('\r\n');
    const filename = `Reporte_607_${corporate.rnc}_${periodMonth}.csv`;
    downloadFile(filename, content, 'text/csv;charset=utf-8');
    showToast(`Reporte Excel/CSV ${filename} descargado.`);
  };

  // Exportar Formato 606 Oficial DGII (.TXT pipe-delimited)
  const handleExport606Txt = () => {
    const headerLine = `606|${corporate.rnc}|${periodMonth}|${purchases606.length}`;
    const rows = purchases606.map((doc) => {
      const cleanId = (
        doc.customerRncOrCedula || corporate.rnc
      ).replace(/\D/g, '');
      const idType = getTaxIdType(cleanId);
      const dateStr = formatDgiiDate(doc.createdAt);
      return [
        cleanId,
        idType,
        '02', // Gastos por trabajos, suministros y servicios
        doc.ncfNumber || doc.documentCode,
        '',
        dateStr,
        dateStr,
        doc.subtotal.toFixed(2),
        '0.00',
        doc.subtotal.toFixed(2),
        doc.itbisAmount.toFixed(2),
        (doc.itbisRetentionAmount || 0).toFixed(2),
        '0.00',
        '0.00',
        '0.00',
        (doc.isrRetentionAmount || 0).toFixed(2),
        '04', // Forma de pago
      ].join('|');
    });

    const content = [headerLine, ...rows].join('\r\n');
    const filename = `DGII_F_606_${corporate.rnc}_${periodMonth}.txt`;
    downloadFile(filename, content);
    showToast(`Archivo oficial ${filename} exportado.`);
  };

  // Emitir Comprobante B11 (Compras Informales) o B13 (Gastos Menores) para el 606
  const handleCreate606Document = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || !purchaseConcept.trim()) {
      showToast('Complete los datos del proveedor y concepto.');
      return;
    }

    try {
      const consumed = await consumeNextNCF(purchaseNcfType);
      const cleanBase = Math.max(0, roundCurrency(purchaseAmount));

      let itbisAmount = 0;
      let itbisRetained = 0;
      let isrRetained = 0;

      if (purchaseNcfType === 'B11') {
        const ret = calculateB11Retentions(cleanBase, retentionCategory);
        itbisAmount = ret.invoicedItbis;
        itbisRetained = ret.retainedItbis;
        isrRetained = ret.retainedIsr;
      }

      const totalDoc = roundCurrency(cleanBase + itbisAmount);
      const netPaid = roundCurrency(totalDoc - itbisRetained - isrRetained);

      const newDoc: IssuedDocument = {
        documentCode: consumed.ncf,
        brandId: activeBrand.id,
        brandName: activeBrand.name,
        moduleUsed: 'SERVICE_MODULE',
        isFiscal: true,
        ncfType: purchaseNcfType,
        ncfNumber: consumed.ncf,
        authorizationNo: consumed.authorizationNo,
        expirationDate: consumed.expirationDate,
        customerName: supplierName.trim(),
        customerRncOrCedula:
          purchaseNcfType === 'B13'
            ? corporate.rnc
            : supplierRncOrCedula.trim(),
        items: [
          {
            id: '1',
            description: purchaseConcept.trim(),
            quantity: 1,
            unit: 'SERV',
            unitPrice: cleanBase,
          },
        ],
        subtotal: cleanBase,
        discountTotal: 0,
        taxableAmount: cleanBase,
        itbisAmount,
        legalTipAmount: 0,
        itbisRetentionAmount: itbisRetained,
        isrRetentionAmount: isrRetained,
        totalAmount: totalDoc,
        amountPaid: netPaid,
        balanceDue: 0,
        goesTo607: false,
        goesTo606: true,
        createdAt: new Date().toISOString(),
        syncStatus: 'LOCAL_ONLY',
      };

      await db.documents.add(newDoc);
      setModal606Open(false);
      showToast(`Comprobante ${consumed.ncf} emitido e incluido en el 606.`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al emitir comprobante 606.';
      showToast(msg);
    }
  };

  const openPrintForDoc = (doc: IssuedDocument) => {
    const seq = doc.ncfType
      ? ncfSequences.find((s) => s.type === doc.ncfType)
      : undefined;

    setPrintData({
      isFiscal: doc.isFiscal,
      brand: activeBrand,
      corporate,
      ncfSequence: seq,
      documentCode: doc.documentCode,
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

  const b11Preview = calculateB11Retentions(purchaseAmount, retentionCategory);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          <Check className="w-4 h-4 text-teal-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* BARRA SUPERIOR CORPORATIVA Y SELECTOR DE FORMATO 607 / 606 */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <strong className="text-slate-900 font-bold">
              {corporate.legalName}
            </strong>
            <span>•</span>
            <span className="font-mono">RNC {corporate.rnc}</span>
            <span>•</span>
            <span>
              Ventas Internas Excluidas del 607:{' '}
              <strong className="font-mono text-slate-900">
                {internalSales.length}
              </strong>
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Generación de formatos de envío DGII basados únicamente en los
            comprobantes fiscales emitidos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Período (AAAAMM):</span>
            <input
              type="text"
              maxLength={6}
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="w-24 rounded-xl border border-slate-200 px-3 py-1.5 font-mono font-bold text-slate-900 text-center"
            />
          </div>

          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveReport('607')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeReport === '607'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Formato 607 (Ventas)
            </button>
            <button
              type="button"
              onClick={() => setActiveReport('606')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeReport === '606'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Formato 606 (Compras B11/B13)
            </button>
          </div>
        </div>
      </div>

      {activeReport === '607' ? (
        /* ==========================================
           VISTA FORMATO 607 (VENTAS FISCALES)
           ========================================== */
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Comprobantes 607
              </span>
              <span className="text-xl font-mono font-bold text-slate-900 mt-1 block">
                {sales607.length}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Monto Facturado Neto
              </span>
              <span className="text-xl font-mono font-bold text-slate-900 mt-1 block">
                RD${' '}
                {total607Subtotal.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-600 block">
                ITBIS Facturado (18%)
              </span>
              <span className="text-xl font-mono font-bold text-teal-700 mt-1 block">
                RD${' '}
                {total607Itbis.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Total General (Inc. Propina)
              </span>
              <span className="text-xl font-mono font-bold text-slate-900 mt-1 block">
                RD${' '}
                {total607General.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                <span>Detalle de Envío 607 • Ventas de Bienes y Servicios</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExport607Csv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar Excel (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={handleExport607Txt}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Exportar TXT Oficial DGII</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">NCF</th>
                    <th className="py-3 px-4">RNC / Cédula</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Unidad</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">18% ITBIS</th>
                    <th className="py-3 px-4 text-right">10% Propina</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {sales607.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="py-10 text-center text-slate-400"
                      >
                        No hay facturas fiscales B01/B02 emitidas aún. Las ventas
                        en Modo Fiscal desde Órdenes, POS o Restaurante
                        aparecerán aquí automáticamente.
                      </td>
                    </tr>
                  ) : (
                    sales607.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono font-bold text-teal-800">
                          {doc.ncfNumber || doc.documentCode}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {doc.customerRncOrCedula || 'Consumidor'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {doc.customerName}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {doc.brandName}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {formatDgiiDate(doc.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          RD${' '}
                          {doc.subtotal.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-teal-700">
                          RD${' '}
                          {doc.itbisAmount.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          RD${' '}
                          {(doc.legalTipAmount || 0).toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          RD${' '}
                          {doc.totalAmount.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openPrintForDoc(doc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            title="Imprimir / Ver"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {sales607.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-mono font-bold text-xs text-slate-900 border-t border-slate-200">
                      <td colSpan={5} className="py-3 px-4 text-right font-sans">
                        Totales Período:
                      </td>
                      <td className="py-3 px-4 text-right">
                        RD${' '}
                        {total607Subtotal.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 px-4 text-right text-teal-700">
                        RD${' '}
                        {total607Itbis.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        RD${' '}
                        {total607Tip.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        RD${' '}
                        {total607General.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ==========================================
           VISTA FORMATO 606 (COMPRAS B11 Y GASTOS MENORES B13)
           ========================================== */
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Comprobantes 606
              </span>
              <span className="text-xl font-mono font-bold text-slate-900 mt-1 block">
                {purchases606.length}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Subtotal Compras / Gastos
              </span>
              <span className="text-xl font-mono font-bold text-slate-900 mt-1 block">
                RD${' '}
                {total606Subtotal.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 block">
                ITBIS Retenido (B11)
              </span>
              <span className="text-xl font-mono font-bold text-amber-700 mt-1 block">
                RD${' '}
                {total606RetainedItbis.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 block">
                ISR Retenido (B11)
              </span>
              <span className="text-xl font-mono font-bold text-rose-700 mt-1 block">
                RD${' '}
                {total606RetainedIsr.toLocaleString('es-DO', {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                <span>
                  Detalle de Envío 606 • Compras (B11) y Gastos Menores (B13)
                </span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModal606Open(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-900 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Emitir B11 / B13</span>
                </button>

                <button
                  type="button"
                  onClick={handleExport606Txt}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Exportar TXT Oficial 606</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">NCF</th>
                    <th className="py-3 px-4">RNC / Cédula</th>
                    <th className="py-3 px-4">Proveedor / Concepto</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">ITBIS</th>
                    <th className="py-3 px-4 text-right">ITBIS Retenido</th>
                    <th className="py-3 px-4 text-right">ISR Retenido</th>
                    <th className="py-3 px-4 text-right">Neto Pagado</th>
                    <th className="py-3 px-4 text-right">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {purchases606.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="py-10 text-center text-slate-400"
                      >
                        No hay comprobantes B11 o B13 emitidos. Usa el botón
                        &ldquo;Emitir B11 / B13&rdquo; para registrar compras a proveedores
                        informales o gastos menores.
                      </td>
                    </tr>
                  ) : (
                    purchases606.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {doc.ncfNumber || doc.documentCode}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {doc.customerRncOrCedula}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {doc.customerName}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {formatDgiiDate(doc.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          RD${' '}
                          {doc.subtotal.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          RD${' '}
                          {doc.itbisAmount.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700 font-semibold">
                          RD${' '}
                          {(doc.itbisRetentionAmount || 0).toLocaleString(
                            'es-DO',
                            { minimumFractionDigits: 2 }
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-700 font-semibold">
                          RD${' '}
                          {(doc.isrRetentionAmount || 0).toLocaleString(
                            'es-DO',
                            { minimumFractionDigits: 2 }
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          RD${' '}
                          {doc.amountPaid.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openPrintForDoc(doc)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA EMITIR B11 (COMPRAS) O B13 (GASTOS MENORES) */}
      {modal606Open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Emitir Comprobante 606 (B11 / B13)
              </h3>
              <button
                type="button"
                onClick={() => setModal606Open(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreate606Document}
              className="p-6 space-y-4 text-xs"
            >
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Tipo de Comprobante
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setPurchaseNcfType('B11')}
                    className={`py-2 px-3 rounded-lg font-semibold ${
                      purchaseNcfType === 'B11'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    B11 • Compras
                  </button>
                  <button
                    type="button"
                    onClick={() => setPurchaseNcfType('B13')}
                    className={`py-2 px-3 rounded-lg font-semibold ${
                      purchaseNcfType === 'B13'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    B13 • Gasto Menor
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Proveedor / Beneficiario *
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nombre completo"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Cédula / RNC
                  </label>
                  <input
                    type="text"
                    value={
                      purchaseNcfType === 'B13'
                        ? corporate.rnc
                        : supplierRncOrCedula
                    }
                    disabled={purchaseNcfType === 'B13'}
                    onChange={(e) => setSupplierRncOrCedula(e.target.value)}
                    placeholder="00100000000"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-600 block mb-1">
                  Concepto de la Compra o Gasto *
                </label>
                <input
                  type="text"
                  required
                  value={purchaseConcept}
                  onChange={(e) => setPurchaseConcept(e.target.value)}
                  placeholder="Ej. Técnico externo de apoyo / Peajes y combustible"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Monto Base (RD$)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={purchaseAmount}
                    onChange={(e) => setPurchaseAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono font-bold"
                  />
                </div>

                {purchaseNcfType === 'B11' && (
                  <div>
                    <label className="font-medium text-slate-600 block mb-1">
                      Retención Aplicable
                    </label>
                    <select
                      value={retentionCategory}
                      onChange={(e) =>
                        setRetentionCategory(
                          e.target.value as B11RetentionCategory
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 px-2.5 py-2 bg-white"
                    >
                      <option value="SERVICIO_TECNICO_2">
                        Oficio / Técnico (2% ISR + 100% ITBIS)
                      </option>
                      <option value="SERVICIO_PROFESIONAL_10">
                        Profesional (10% ISR + 100% ITBIS)
                      </option>
                      <option value="COMPRA_BIENES_GRAVADOS">
                        Compra Bienes (0% ISR + 100% ITBIS)
                      </option>
                    </select>
                  </div>
                )}
              </div>

              {purchaseNcfType === 'B11' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>ITBIS Facturado (18%):</span>
                    <span>
                      RD${' '}
                      {b11Preview.invoicedItbis.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>ITBIS Retenido (100%):</span>
                    <span>
                      - RD${' '}
                      {b11Preview.retainedItbis.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>
                      ISR Retenido ({b11Preview.isrRetentionRate * 100}%):
                    </span>
                    <span>
                      - RD${' '}
                      {b11Preview.retainedIsr.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                    <span>Neto a Desembolsar:</span>
                    <span>
                      RD${' '}
                      {b11Preview.netPayableToSupplier.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModal606Open(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                >
                  Emitir Comprobante
                </button>
              </div>
            </form>
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
