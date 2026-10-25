import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Plus,
  ShieldCheck,
  Building2,
  Calendar,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Filter,
  Printer,
} from 'lucide-react';
import {
  type BrandProfile,
  type CorporateConfig,
  type IssuedDocument,
  type NCFSequence,
} from '../db/db';
import {
  calculateB11Retentions,
  issueDocumentTransaction,
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

function formatDgiiDate(isoDate: string): string {
  const d = new Date(isoDate);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function formatMoney(value: number): string {
  return `RD$ ${value.toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const DGIIReportsView: React.FC<DGIIReportsViewProps> = ({
  corporate,
  activeBrand,
  ncfSequences,
  documents,
}) => {
  const [activeTab, setActiveTab] = useState<'607' | '606'>('607');
  const [periodMonth, setPeriodMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterByPeriod, setFilterByPeriod] = useState<boolean>(true);
  const [filterBrandOnly, setFilterBrandOnly] = useState<boolean>(false);

  // Modal de Emisión B11 / B13 para Formato 606
  const [showAdd606Modal, setShowAdd606Modal] = useState(false);
  const [expenseType, setExpenseType] = useState<'B11' | 'B13'>('B11');
  const [supplierName, setSupplierName] = useState('');
  const [supplierRnc, setSupplierRnc] = useState('');
  const [concept, setConcept] = useState('');
  const [grossAmount, setGrossAmount] = useState<string>('');
  const [b11Category, setB11Category] = useState<B11RetentionCategory>(
    'SERVICIO_TECNICO_2'
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);

  // 607: Comprobantes Fiscales de Venta (B01, B02, B04) filtrados por período AAAAMM cuando filterByPeriod = true
  const sales607 = useMemo(() => {
    return documents.filter((doc) => {
      if (!doc.isFiscal || !doc.goesTo607) return false;
      if (filterBrandOnly && doc.brandId !== activeBrand.id) return false;
      if (filterByPeriod && periodMonth.trim().length === 6) {
        const docPeriod = formatDgiiDate(doc.createdAt).slice(0, 6);
        if (docPeriod !== periodMonth.trim()) return false;
      }
      return true;
    });
  }, [documents, filterBrandOnly, activeBrand.id, filterByPeriod, periodMonth]);

  // 606: Comprobantes de Compra B11 y Gastos Menores B13 filtrados por período AAAAMM
  const purchases606 = useMemo(() => {
    return documents.filter((doc) => {
      if (!doc.isFiscal || !doc.goesTo606) return false;
      if (filterBrandOnly && doc.brandId !== activeBrand.id) return false;
      if (filterByPeriod && periodMonth.trim().length === 6) {
        const docPeriod = formatDgiiDate(doc.createdAt).slice(0, 6);
        if (docPeriod !== periodMonth.trim()) return false;
      }
      return true;
    });
  }, [documents, filterBrandOnly, activeBrand.id, filterByPeriod, periodMonth]);

  // Órdenes Internas (isFiscal: false) excluidas del 607
  const internalSales = useMemo(() => {
    return documents.filter((doc) => {
      if (doc.isFiscal) return false;
      if (filterBrandOnly && doc.brandId !== activeBrand.id) return false;
      if (filterByPeriod && periodMonth.trim().length === 6) {
        const docPeriod = formatDgiiDate(doc.createdAt).slice(0, 6);
        if (docPeriod !== periodMonth.trim()) return false;
      }
      return true;
    });
  }, [documents, filterBrandOnly, activeBrand.id, filterByPeriod, periodMonth]);

  const summary = useMemo(() => {
    const totalSales607 = sales607.reduce(
      (acc, d) =>
        acc + (d.ncfType === 'B04' ? -d.taxableAmount : d.taxableAmount),
      0
    );
    const totalItbisCollected = sales607.reduce(
      (acc, d) => acc + (d.ncfType === 'B04' ? -d.itbisAmount : d.itbisAmount),
      0
    );
    const totalLegalTip = sales607.reduce(
      (acc, d) =>
        acc + (d.ncfType === 'B04' ? -d.legalTipAmount : d.legalTipAmount),
      0
    );
    const totalPurchases606 = purchases606.reduce(
      (acc, e) => acc + e.subtotal,
      0
    );
    const totalItbisPaid = purchases606.reduce(
      (acc, e) => acc + e.itbisAmount,
      0
    );
    const totalInternal = internalSales.reduce(
      (acc, d) => acc + d.totalAmount,
      0
    );

    return {
      totalSales607,
      totalItbisCollected,
      totalLegalTip,
      totalPurchases606,
      totalItbisPaid,
      itbisNetPayable: Math.max(0, totalItbisCollected - totalItbisPaid),
      totalInternal,
    };
  }, [sales607, purchases606, internalSales]);

  // Exportar TXT Oficial DGII 607 incluyendo doc.modifiedNcf en la columna 4 para Notas de Crédito B04
  const handleExport607Txt = () => {
    const header = `607|${corporate.rnc}|${periodMonth}|${sales607.length}`;
    const lines = sales607.map((doc) => {
      const rncOrCedula = (doc.customerRncOrCedula || '').replace(/\D/g, '');
      const idType =
        rncOrCedula.length === 9 ? '1' : rncOrCedula.length === 11 ? '2' : '3';
      const issueDate = formatDgiiDate(doc.createdAt);
      return [
        rncOrCedula || '000000000',
        idType,
        doc.ncfNumber || doc.documentCode,
        doc.modifiedNcf || '', // Columna 4: NCF Modificado (Obligatorio para B04)
        '01', // Ingresos por Operaciones (No Financieros)
        issueDate,
        '', // Fecha Retención
        doc.taxableAmount.toFixed(2),
        doc.itbisAmount.toFixed(2),
        '0.00', // ITBIS Retenido por Terceros
        '0.00', // ITBIS Percibido
        '0.00', // Retención Renta por Terceros
        '0.00', // ISR Percibido
        '0.00', // Impuesto Selectivo al Consumo
        '0.00', // Otros Impuestos/Tasas
        doc.legalTipAmount.toFixed(2), // Monto Propina Legal (10%)
      ].join('|');
    });

    const content = [header, ...lines].join('\r\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DGII_F_607_${corporate.rnc}_${periodMonth}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar TXT Oficial DGII 606
  const handleExport606Txt = () => {
    const header = `606|${corporate.rnc}|${periodMonth}|${purchases606.length}`;
    const lines = purchases606.map((exp) => {
      const cleanRnc = (exp.customerRncOrCedula || corporate.rnc).replace(
        /\D/g,
        ''
      );
      const idType = cleanRnc.length === 9 ? '1' : '2';
      const issueDate = formatDgiiDate(exp.createdAt);
      return [
        cleanRnc,
        idType,
        '02', // 02 - Gastos por Trabajos, Suministros y Servicios
        exp.ncfNumber || exp.documentCode,
        exp.modifiedNcf || '',
        issueDate.slice(0, 6),
        issueDate.slice(6, 8),
        issueDate.slice(0, 6),
        issueDate.slice(6, 8),
        exp.subtotal.toFixed(2),
        exp.itbisAmount.toFixed(2),
        (exp.itbisRetentionAmount || 0).toFixed(2),
        '0.00',
        (exp.isrRetentionAmount || 0).toFixed(2),
        '01', // Efectivo / Transferencia
      ].join('|');
    });

    const content = [header, ...lines].join('\r\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DGII_F_606_${corporate.rnc}_${periodMonth}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const b11Preview = calculateB11Retentions(
    Number(grossAmount) || 0,
    b11Category
  );

  const handleEmitB11OrB13 = async (e: React.FormEvent) => {
    e.preventDefault();
    const numGross = Number(grossAmount) || 0;
    if (!concept.trim() || numGross <= 0) return;

    try {
      const emitted = await issueDocumentTransaction({
        brandId: activeBrand.id,
        moduleUsed: 'SERVICE_MODULE',
        isFiscal: true,
        ncfType: expenseType,
        customerName:
          expenseType === 'B13'
            ? supplierName.trim() || corporate.legalName
            : supplierName.trim() || 'Proveedor Informal',
        customerRncOrCedula:
          expenseType === 'B13'
            ? corporate.rnc
            : supplierRnc.trim() || '00000000000',
        items: [
          {
            id: `exp-${Date.now()}`,
            description: concept.trim(),
            quantity: 1,
            unit: 'SERV',
            unitPrice: numGross,
            taxExempt: expenseType === 'B13',
          },
        ],
        includeLegalTip: false,
        depositPercentage: 100,
      });

      setSupplierName('');
      setSupplierRnc('');
      setConcept('');
      setGrossAmount('');
      setShowAdd606Modal(false);
      setToastMsg(`Comprobante ${emitted.documentCode} emitido en 606.`);
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err: unknown) {
      setToastMsg(
        err instanceof Error ? err.message : 'Error al emitir comprobante 606.'
      );
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  const handleReprintDoc = (doc: IssuedDocument) => {
    const seq = doc.ncfType
      ? ncfSequences.find((s) => s.type === doc.ncfType)
      : undefined;
    setPrintDoc({
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
    <div className="space-y-6">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* Encabezado Ejecutivo DGII */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Reportes Fiscales DGII (Formatos 606 & 607)
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              RNC {corporate.rnc}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Consolidación tributaria de {corporate.legalName} • Exportación directa en formato oficial `.TXT` (Pipe-Delimited)
          </p>
        </div>

        {/* Controles de Período AAAAMM + Filtro Activo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500">
              Período:
            </span>
            <input
              type="text"
              maxLength={6}
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              className="w-16 text-xs font-mono font-bold text-slate-900 focus:outline-none"
              placeholder="AAAAMM"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilterByPeriod(!filterByPeriod)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              filterByPeriod
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>
              {filterByPeriod
                ? `Filtrando ${periodMonth}`
                : 'Ver Todos los Períodos'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterBrandOnly(!filterBrandOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              filterBrandOnly
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>
              {filterBrandOnly
                ? `Solo ${activeBrand.name}`
                : 'Consolidado 4 Divisiones'}
            </span>
          </button>
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Ventas Fiscales (607)</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-extrabold font-mono text-slate-900">
            {formatMoney(summary.totalSales607)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            ITBIS Facturado:{' '}
            <strong className="font-mono text-slate-800">
              {formatMoney(summary.totalItbisCollected)}
            </strong>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>Compras y Gastos (606)</span>
            <ArrowDownLeft className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg font-extrabold font-mono text-slate-900">
            {formatMoney(summary.totalPurchases606)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            ITBIS en Compras:{' '}
            <strong className="font-mono text-slate-800">
              {formatMoney(summary.totalItbisPaid)}
            </strong>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>ITBIS Neto Estimado (IT-1)</span>
            <FileSpreadsheet className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg font-extrabold font-mono text-amber-700">
            {formatMoney(summary.itbisNetPayable)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Propina Legal 10%:{' '}
            <strong className="font-mono text-slate-800">
              {formatMoney(summary.totalLegalTip)}
            </strong>
          </p>
        </div>

        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
            <span>Órdenes Internas (Sin NCF)</span>
            <FileText className="w-4 h-4 text-slate-300" />
          </div>
          <p className="text-lg font-extrabold font-mono text-white">
            {formatMoney(summary.totalInternal)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Excluidas automáticamente del TXT 607
          </p>
        </div>
      </div>

      {/* Tabla 607 / 606 y Exportación TXT */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('607')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === '607'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Formato 607 • Ventas ({sales607.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('606')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === '606'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Formato 606 • Compras B11 / B13 ({purchases606.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === '606' && (
              <button
                type="button"
                onClick={() => setShowAdd606Modal(true)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Emitir B11 / B13</span>
              </button>
            )}

            <button
              type="button"
              onClick={
                activeTab === '607' ? handleExport607Txt : handleExport606Txt
              }
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar TXT {activeTab} Oficial DGII</span>
            </button>
          </div>
        </div>

        {activeTab === '607' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">NCF</th>
                  <th className="py-3 px-4">NCF Modificado</th>
                  <th className="py-3 px-4">RNC / Cédula</th>
                  <th className="py-3 px-4">Cliente / Razón Social</th>
                  <th className="py-3 px-4 text-right">Monto Gravado</th>
                  <th className="py-3 px-4 text-right">ITBIS (18%)</th>
                  <th className="py-3 px-4 text-right">Propina (10%)</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {sales607.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-10 text-center text-slate-400"
                    >
                      No hay comprobantes fiscales en este período.
                    </td>
                  </tr>
                ) : (
                  sales607.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatDgiiDate(doc.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-mono font-bold text-xs ${
                            doc.ncfType === 'B04'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {doc.ncfNumber || doc.documentCode}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {doc.modifiedNcf || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {doc.customerRncOrCedula || '000000000'}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {doc.customerName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatMoney(doc.taxableAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {formatMoney(doc.itbisAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-700">
                        {formatMoney(doc.legalTipAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatMoney(doc.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleReprintDoc(doc)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                          title="Ver / Imprimir Comprobante"
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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">NCF Emitido</th>
                  <th className="py-3 px-4">RNC / Cédula</th>
                  <th className="py-3 px-4">Proveedor / Concepto</th>
                  <th className="py-3 px-4 text-right">Subtotal</th>
                  <th className="py-3 px-4 text-right">ITBIS</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {purchases606.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-slate-400"
                    >
                      No hay comprobantes B11 o B13 emitidos en este período.
                    </td>
                  </tr>
                ) : (
                  purchases606.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatDgiiDate(exp.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-mono text-blue-700 font-bold">
                        {exp.ncfNumber || exp.documentCode}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {exp.customerRncOrCedula || corporate.rnc}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {exp.customerName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono">
                        {formatMoney(exp.subtotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-700">
                        {formatMoney(exp.itbisAmount)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatMoney(exp.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleReprintDoc(exp)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
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
        )}
      </div>

      {/* Modal Emitir B11 / B13 */}
      {showAdd606Modal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleEmitB11OrB13}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  Emitir Comprobante 606 (B11 / B13)
                </h3>
                <p className="text-[11px] text-slate-300">
                  Compras a proveedores informales o gastos menores
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdd606Modal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                Cerrar
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setExpenseType('B11')}
                  className={`py-1.5 rounded-lg text-xs font-bold ${
                    expenseType === 'B11'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  B11 • Compras
                </button>
                <button
                  type="button"
                  onClick={() => setExpenseType('B13')}
                  className={`py-1.5 rounded-lg text-xs font-bold ${
                    expenseType === 'B13'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  B13 • Gasto Menor
                </button>
              </div>

              {expenseType === 'B11' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                      Cédula / RNC Suplidor
                    </label>
                    <input
                      type="text"
                      required
                      value={supplierRnc}
                      onChange={(e) => setSupplierRnc(e.target.value)}
                      placeholder="00112345678"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                      Nombre Proveedor
                    </label>
                    <input
                      type="text"
                      required
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="Nombre completo"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Concepto del Gasto o Servicio
                </label>
                <input
                  type="text"
                  required
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Descripción del servicio o compra..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Monto Base (RD$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={grossAmount}
                  onChange={(e) => setGrossAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono"
                />
              </div>

              {expenseType === 'B11' && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                  <select
                    value={b11Category}
                    onChange={(e) =>
                      setB11Category(e.target.value as B11RetentionCategory)
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    <option value="SERVICIO_TECNICO_2">
                      Servicio Técnico / Oficio (2% ISR + 100% ITBIS)
                    </option>
                    <option value="SERVICIO_PROFESIONAL_10">
                      Honorarios Profesionales (10% ISR + 100% ITBIS)
                    </option>
                    <option value="COMPRA_BIENES_GRAVADOS">
                      Compra Bienes Gravados (0% ISR + 100% ITBIS)
                    </option>
                  </select>
                  <div className="flex justify-between text-[11px] text-slate-600 pt-1">
                    <span>Neto a pagar al proveedor:</span>
                    <strong className="font-mono text-slate-900">
                      {formatMoney(b11Preview.netPayableToSupplier)}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd606Modal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Emitir {expenseType}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {printDoc && (
        <InvoicePrintModal data={printDoc} onClose={() => setPrintDoc(null)} />
      )}
    </div>
  );
};
