import React, { useState } from 'react';
import {
  Check,
  Edit3,
  FileText,
  Layers,
  Phone,
  Printer,
  Receipt,
  Save,
  X,
} from 'lucide-react';
import {
  db,
  type BrandId,
  type BrandProfile,
  type CorporateConfig,
  type InternalDocType,
  type InvoiceItem,
  type IssuedDocument,
  type ModuleType,
  type NCFSequence,
  type NCFType,
} from '../db/db';
import {
  buildDocumentHeaderMetadata,
  calculateInvoiceTotals,
  formatNCF,
  getNCFSequenceStatus,
  issueDocumentTransaction,
} from '../services/fiscalService';
import { BrandLogo } from '../components/BrandLogo';

interface SettingsViewProps {
  corporate: CorporateConfig;
  brands: BrandProfile[];
  activeBrand: BrandProfile;
  onSelectBrand: (id: BrandId) => void;
  ncfSequences: NCFSequence[];
  recentDocuments: IssuedDocument[];
}

type SettingsTab = 'NCF_TABLE' | 'BRANDS_GRID' | 'INVOICE_PREVIEW';

const MODULE_SWITCHES: {
  id: ModuleType;
  label: string;
}[] = [
  { id: 'SERVICE_MODULE', label: 'Servicios' },
  { id: 'RETAIL_MODULE', label: 'Inventario/POS' },
  { id: 'RESTAURANT_MODULE', label: 'Restaurante' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  corporate,
  brands,
  activeBrand,
  onSelectBrand,
  ncfSequences,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('NCF_TABLE');

  // Edición de fila en la tabla NCF
  const [editingType, setEditingType] = useState<NCFType | null>(null);
  const [editCurrent, setEditCurrent] = useState<number>(1);
  const [editLimit, setEditLimit] = useState<number>(15);
  const [editAuth, setEditAuth] = useState<string>('');
  const [editExp, setEditExp] = useState<string>('');

  // Controles de Vista Previa de Factura / Recibo
  const [isFiscalMode, setIsFiscalMode] = useState<boolean>(false);
  const [selectedNcfType, setSelectedNcfType] = useState<NCFType>('B01');
  const [internalTitle, setInternalTitle] =
    useState<InternalDocType>('ORDEN_DE_SERVICIO');
  const [customerName, setCustomerName] = useState<string>(
    'Constructora Del Caribe, S.R.L.'
  );
  const [customerRnc, setCustomerRnc] = useState<string>('131889921');
  const [includeLegalTip, setIncludeLegalTip] = useState<boolean>(
    activeBrand.enableLegalTipByDefault
  );
  const [depositPercentage, setDepositPercentage] = useState<number>(
    activeBrand.defaultDepositPercentage || 100
  );
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleStartEdit = (seq: NCFSequence) => {
    setEditingType(seq.type);
    setEditCurrent(seq.currentNumber);
    setEditLimit(seq.limitNumber);
    setEditAuth(seq.authorizationNo);
    setEditExp(seq.expirationDate);
  };

  const handleSaveEdit = async (seq: NCFSequence) => {
    if (editCurrent < 1 || editLimit < 1 || editCurrent > editLimit + 1) {
      return;
    }

    await db.ncfSequences.put({
      ...seq,
      currentNumber: editCurrent,
      limitNumber: editLimit,
      authorizationNo: editAuth.trim() || seq.authorizationNo,
      expirationDate: editExp.trim() || 'N/A',
      rangeStartFormatted: formatNCF(seq.type, seq.startNumber),
      rangeEndFormatted: formatNCF(seq.type, editLimit),
      updatedAt: new Date().toISOString(),
    });

    setEditingType(null);
    showNotice(`Secuencia ${seq.type} actualizada.`);
  };

  const handleToggleModule = async (brand: BrandProfile, mod: ModuleType) => {
    const isActive = brand.activeModules.includes(mod);
    if (isActive && brand.activeModules.length === 1) {
      showNotice('Debe mantener al menos un módulo activo.');
      return;
    }

    const updatedModules = isActive
      ? brand.activeModules.filter((m) => m !== mod)
      : [...brand.activeModules, mod];

    await db.brands.put({
      ...brand,
      activeModules: updatedModules,
    });
  };

  const getSampleItems = (brandId: BrandId): InvoiceItem[] => {
    switch (brandId) {
      case 'bridge-tech':
        return [
          {
            id: '1',
            description: 'Automatización Smart Home & Control de Acceso',
            quantity: 1,
            unit: 'PROY',
            unitPrice: 28500,
          },
          {
            id: '2',
            description: 'Puntos de Red Cat6A Certificados',
            quantity: 4,
            unit: 'UND',
            unitPrice: 3200,
          },
        ];
      case 'atelier':
        return [
          {
            id: '1',
            description: 'Confección Traje de Gala Alta Costura a Medida',
            quantity: 1,
            unit: 'SERV',
            unitPrice: 18500,
          },
          {
            id: '2',
            description: 'Set Uniformes Ejecutivos Bordados (6 piezas)',
            quantity: 1,
            unit: 'LOTE',
            unitPrice: 14400,
          },
        ];
      case 'sb-mantenimiento':
        return [
          {
            id: '1',
            description: 'Instalación & Mantenimiento A/C Inverter 24,000 BTU',
            quantity: 2,
            unit: 'SERV',
            unitPrice: 6500,
          },
          {
            id: '2',
            description: 'Recarga Refrigerante R410A y Limpieza Química',
            quantity: 2,
            unit: 'UND',
            unitPrice: 2800,
          },
        ];
      case 'metro-food':
        return [
          {
            id: '1',
            description: 'Bandeja Mixta Parrillada & Burgers Artesanales',
            quantity: 2,
            unit: 'ORD',
            unitPrice: 1650,
          },
          {
            id: '2',
            description: 'Jarras Limonada Natural con Hierbabuena',
            quantity: 2,
            unit: 'UND',
            unitPrice: 450,
          },
        ];
    }
  };

  const sampleItems = getSampleItems(activeBrand.id);
  const activeSequence =
    ncfSequences.find((s) => s.type === selectedNcfType) || ncfSequences[0];

  const previewTotals = calculateInvoiceTotals(sampleItems, {
    isFiscal: isFiscalMode,
    includeLegalTip,
    depositPercentage,
  });

  const previewHeader = buildDocumentHeaderMetadata({
    isFiscal: isFiscalMode,
    brand: activeBrand,
    corporate,
    ncfSequence: activeSequence,
    internalDocTitle: internalTitle,
  });

  const handleEmitSample = async () => {
    try {
      const emitted = await issueDocumentTransaction({
        brandId: activeBrand.id,
        moduleUsed: activeBrand.activeModules[0] || 'SERVICE_MODULE',
        isFiscal: isFiscalMode,
        ncfType: isFiscalMode ? selectedNcfType : undefined,
        internalDocTitle: !isFiscalMode ? internalTitle : undefined,
        customerName,
        customerRncOrCedula: isFiscalMode ? customerRnc : undefined,
        items: sampleItems,
        includeLegalTip,
        depositPercentage,
      });

      showNotice(
        `Comprobante ${emitted.documentCode} generado correctamente.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al emitir.';
      showNotice(msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* NOTIFICACIÓN DISCRETA */}
      {notice && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          <Check className="w-4 h-4 text-teal-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* NAVEGACIÓN DE PESTAÑAS (TABS LIMPIAS) */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('NCF_TABLE')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'NCF_TABLE'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Secuencias NCF (DGII)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('BRANDS_GRID')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'BRANDS_GRID'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Unidades de Negocio (Marcas)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('INVOICE_PREVIEW')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'INVOICE_PREVIEW'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Vista Previa de Factura / Recibo</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SECUENCIAS NCF (DGII) - TABLA EJECUTIVA COMPACTA */}
      {activeTab === 'NCF_TABLE' && (
        <div className="space-y-4">
          {/* BARRA CORPORATIVA COMPACTA */}
          <div className="bg-white rounded-xl border border-slate-200/90 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-700">
              <strong className="font-bold text-slate-900">
                {corporate.legalName}
              </strong>
              <span className="text-slate-300">•</span>
              <span className="font-mono">RNC {corporate.rnc}</span>
              <span className="text-slate-300">•</span>
              <span className="font-mono">
                Reg. Mercantil {corporate.regMercantil}
              </span>
            </div>

            <span className="text-xs font-mono text-slate-500">
              Solicitud No. {corporate.dgiiRequestNumber}
            </span>
          </div>

          {/* TABLA EJECUTIVA DE 5 FILAS */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4">Serie</th>
                    <th className="py-3.5 px-4">Tipo de Comprobante</th>
                    <th className="py-3.5 px-4">Autorización</th>
                    <th className="py-3.5 px-4">Rango</th>
                    <th className="py-3.5 px-4">Próximo NCF</th>
                    <th className="py-3.5 px-4">Disponibles</th>
                    <th className="py-3.5 px-4">Vencimiento</th>
                    <th className="py-3.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {ncfSequences.map((seq) => {
                    const status = getNCFSequenceStatus(seq);
                    const isEditing = editingType === seq.type;

                    return (
                      <tr
                        key={seq.type}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-900 font-mono font-bold text-xs">
                            {seq.type}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {seq.name}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editAuth}
                              onChange={(e) => setEditAuth(e.target.value)}
                              className="w-28 px-2 py-1 rounded border border-slate-300 font-mono text-xs"
                            />
                          ) : (
                            seq.authorizationNo
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                value={editCurrent}
                                onChange={(e) =>
                                  setEditCurrent(Number(e.target.value))
                                }
                                className="w-16 px-2 py-1 rounded border border-slate-300 font-mono text-xs"
                                title="Actual"
                              />
                              <span className="text-slate-400">/</span>
                              <input
                                type="number"
                                min={1}
                                value={editLimit}
                                onChange={(e) =>
                                  setEditLimit(Number(e.target.value))
                                }
                                className="w-16 px-2 py-1 rounded border border-slate-300 font-mono text-xs"
                                title="Límite"
                              />
                            </div>
                          ) : (
                            <span>
                              {seq.rangeStartFormatted} – {seq.rangeEndFormatted}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block font-mono font-semibold px-2 py-0.5 rounded ${
                              status.isExhausted
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-teal-50 text-teal-800'
                            }`}
                          >
                            {status.nextFormatted}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="w-36 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-800">
                                {status.remaining} de {status.totalApproved}
                              </span>
                              <span className="text-slate-400 font-mono">
                                {100 - status.usagePercent}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  status.isExhausted
                                    ? 'bg-rose-500'
                                    : status.alertLevel === 'WARNING'
                                    ? 'bg-amber-500'
                                    : 'bg-teal-600'
                                }`}
                                style={{
                                  width: `${Math.max(
                                    6,
                                    100 - status.usagePercent
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editExp}
                              onChange={(e) => setEditExp(e.target.value)}
                              className="w-24 px-2 py-1 rounded border border-slate-300 font-mono text-xs"
                            />
                          ) : (
                            seq.expirationDate
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(seq)}
                                className="p-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                                title="Guardar"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingType(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(seq)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: UNIDADES DE NEGOCIO (MARCAS) - GRID 2x2 LIMPIO */}
      {activeTab === 'BRANDS_GRID' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {brands.map((brand) => {
            const isSelected = brand.id === activeBrand.id;
            return (
              <div
                key={brand.id}
                className={`bg-white rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                  isSelected
                    ? 'border-slate-900 ring-1 ring-slate-900/10 shadow-sm'
                    : 'border-slate-200/90 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div>
                  {/* LOGO PROTAGONISTA GRANDE Y NÍTIDO */}
                  <div className="flex flex-col items-center text-center pb-5 border-b border-slate-100">
                    <BrandLogo
                      brandId={brand.id}
                      size="lg"
                      className="w-full h-36 mb-4"
                    />

                    <h3 className="text-base font-bold text-slate-900">
                      {brand.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {brand.subtitle}
                    </p>
                    <div className="inline-flex items-center gap-1.5 mt-2 text-xs font-mono text-slate-600">
                      <Phone className="w-3.5 h-3.5 text-teal-600" />
                      <span>{brand.phone}</span>
                    </div>
                  </div>

                  {/* 3 SWITCHES LIMPIOS DE MÓDULOS */}
                  <div className="py-4 space-y-2.5">
                    {MODULE_SWITCHES.map((mod) => {
                      const enabled = brand.activeModules.includes(mod.id);
                      return (
                        <div
                          key={mod.id}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="text-xs font-medium text-slate-700">
                            {mod.label}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => handleToggleModule(brand, mod.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              enabled ? 'bg-slate-900' : 'bg-slate-200'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                enabled ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* BOTÓN SELECCIONAR MARCA */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">
                    Secuencia: {brand.internalPrefix}-
                    {String(brand.internalCounter).padStart(4, '0')}
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectBrand(brand.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-slate-100 text-slate-900'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isSelected ? 'Unidad Activa' : 'Seleccionar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: VISTA PREVIA DE FACTURA / RECIBO (2 COLUMNAS LIMPIAS) */}
      {activeTab === 'INVOICE_PREVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUMNA IZQUIERDA: CONTROLES SIMPLES */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 space-y-5 shadow-xs">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-2">
                Modalidad de Cobro
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFiscalMode(false)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    !isFiscalMode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Recibo Interno
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiscalMode(true)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    isFiscalMode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Factura Fiscal (NCF)
                </button>
              </div>
            </div>

            {isFiscalMode ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">
                    Tipo de Comprobante
                  </label>
                  <select
                    value={selectedNcfType}
                    onChange={(e) =>
                      setSelectedNcfType(e.target.value as NCFType)
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white"
                  >
                    {ncfSequences.map((s) => (
                      <option key={s.type} value={s.type}>
                        {s.type} • {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      Cliente
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      RNC / Cédula
                    </label>
                    <input
                      type="text"
                      value={customerRnc}
                      onChange={(e) => setCustomerRnc(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">
                    Encabezado del Documento
                  </label>
                  <select
                    value={internalTitle}
                    onChange={(e) =>
                      setInternalTitle(e.target.value as InternalDocType)
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 bg-white"
                  >
                    <option value="ORDEN_DE_SERVICIO">ORDEN DE SERVICIO</option>
                    <option value="RECIBO_DE_PAGO">RECIBO DE PAGO</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">
                  Propina Legal (10%)
                </span>
                <input
                  type="checkbox"
                  checked={includeLegalTip}
                  onChange={(e) => setIncludeLegalTip(e.target.checked)}
                  className="w-4 h-4 accent-slate-900 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-700">
                    Condición de Pago
                  </span>
                  <span className="font-mono text-slate-500">
                    {depositPercentage}% inicial
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDepositPercentage(pct)}
                      className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        depositPercentage === pct
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {pct === 100 ? '100% Total' : `Abono ${pct}%`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleEmitSample}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>Emitir Comprobante de Prueba</span>
            </button>
          </div>

          {/* COLUMNA DERECHA: DOCUMENTO IMPRESO CON BRANDLOGO NÍTIDO */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 p-8 shadow-sm">
            {/* ENCABEZADO DEL DOCUMENTO */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200">
              <div className="space-y-2">
                <BrandLogo
                  brandId={activeBrand.id}
                  size="md"
                  className="w-52 h-24"
                />
                <div className="pt-1">
                  <h4 className="text-base font-bold text-slate-900">
                    {previewHeader.brandName}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {previewHeader.brandSubtitle} • Tel: {previewHeader.brandPhone}
                  </p>

                  {/* SOLO MOSTRAR ENCABEZADO FISCAL EN MODO FISCAL */}
                  {previewHeader.isFiscal &&
                    previewHeader.corporateLegalName &&
                    previewHeader.corporateRnc && (
                      <p className="text-xs font-semibold text-slate-800 mt-2 pt-2 border-t border-slate-100">
                        {previewHeader.corporateLegalName} | RNC:{' '}
                        <span className="font-mono">
                          {previewHeader.corporateRnc}
                        </span>
                      </p>
                    )}
                </div>
              </div>

              <div className="sm:text-right bg-slate-50 px-4 py-3 rounded-xl border border-slate-200/80 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
                  {previewHeader.documentTitle}
                </span>
                <span className="text-base font-mono font-bold text-slate-900 block mt-0.5">
                  {previewHeader.isFiscal
                    ? `NCF: ${previewHeader.documentNumber}`
                    : `No. ${previewHeader.documentNumber}`}
                </span>

                {previewHeader.isFiscal && (
                  <div className="mt-1.5 text-[11px] font-mono text-slate-500 space-y-0.5">
                    <div>Autorización: {previewHeader.authorizationNo}</div>
                    <div>Válido hasta: {previewHeader.expirationDate}</div>
                  </div>
                )}
              </div>
            </div>

            {/* CLIENTE Y FECHA */}
            <div className="py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-slate-400">Cliente: </span>
                <strong className="text-slate-900">{customerName}</strong>
              </div>
              {previewHeader.isFiscal && customerRnc && (
                <div className="font-mono">
                  <span className="text-slate-400">RNC/Cédula: </span>
                  <strong className="text-slate-900">{customerRnc}</strong>
                </div>
              )}
              <div className="font-mono text-slate-500">
                Fecha: {new Date().toLocaleDateString('es-DO')}
              </div>
            </div>

            {/* DETALLE DE ÍTEMS */}
            <div className="py-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                    <th className="py-2 text-left">Cant.</th>
                    <th className="py-2 text-left">Descripción</th>
                    <th className="py-2 text-right">Precio</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sampleItems.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2.5 font-mono text-slate-600">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-2.5 font-medium text-slate-900">
                        {item.description}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-600">
                        RD${' '}
                        {item.unitPrice.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                        RD${' '}
                        {(item.quantity * item.unitPrice).toLocaleString(
                          'es-DO',
                          { minimumFractionDigits: 2 }
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* TOTALES */}
            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <div className="w-full sm:w-64 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>
                    RD${' '}
                    {previewTotals.netSubtotal.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                {previewHeader.showItbisBreakdown && (
                  <div className="flex justify-between text-slate-800">
                    <span>18% ITBIS:</span>
                    <span>
                      RD${' '}
                      {previewTotals.itbisAmount.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}

                {previewTotals.legalTipAmount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>10% Propina Legal:</span>
                    <span>
                      RD${' '}
                      {previewTotals.legalTipAmount.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>TOTAL:</span>
                  <span>
                    RD${' '}
                    {previewTotals.totalAmount.toLocaleString('es-DO', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>

                {previewTotals.depositPercentage < 100 && (
                  <div className="pt-2 border-t border-dashed border-slate-200 space-y-1 text-[11px]">
                    <div className="flex justify-between text-teal-700 font-semibold">
                      <span>Abono ({previewTotals.depositPercentage}%):</span>
                      <span>
                        RD${' '}
                        {previewTotals.amountToPayNow.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Pendiente al entregar:</span>
                      <span>
                        RD${' '}
                        {previewTotals.balanceDue.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
