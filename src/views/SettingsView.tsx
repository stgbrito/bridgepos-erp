import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Check,
  Database,
  Download,
  Edit3,
  FileText,
  History,
  Layers,
  Phone,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Search,
  Shield,
  Tag,
  Trash2,
  Upload,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  db,
  INITIAL_RESTAURANT_TABLES,
  logAuditAction,
  type BrandId,
  type BrandProfile,
  type CorporateConfig,
  type InternalDocType,
  type InvoiceItem,
  type IssuedDocument,
  type ModuleType,
  type NCFSequence,
  type NCFType,
  type UserRole,
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

type SettingsTab =
  | 'NCF_TABLE'
  | 'BRANDS_GRID'
  | 'STAFF_USERS'
  | 'PROMO_CODES'
  | 'RESTAURANT_TABLES'
  | 'AUDIT_LOGS'
  | 'BACKUP_JSON'
  | 'INVOICE_PREVIEW';

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

  // Consultas reactivas para el panel de Administración
  const staffUsers = useLiveQuery(() => db.staffUsers.toArray(), []) || [];
  const promoCodes = useLiveQuery(() => db.promoCodes.toArray(), []) || [];
  const restaurantTables =
    useLiveQuery(() => db.restaurantTables.toArray(), []) || [];
  const auditLogs =
    useLiveQuery(
      () => db.auditLogs.orderBy('timestamp').reverse().limit(150).toArray(),
      []
    ) || [];

  // Estados de Gestión de Usuarios
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('CAJERO');
  const [newUserPin, setNewUserPin] = useState('');

  // Estados de Códigos de Descuento
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoDesc, setNewPromoDesc] = useState('');
  const [newPromoType, setNewPromoType] = useState<'PERCENT' | 'FIXED'>(
    'PERCENT'
  );
  const [newPromoValue, setNewPromoValue] = useState<number>(10);

  // Filtro de Bitácora de Auditoría
  const [auditSearch, setAuditSearch] = useState('');
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>('ALL');

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

  // Handlers de Administración de Usuarios
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    const pinClean = newUserPin.trim() || '0000';
    const created = {
      id: `USR-${Date.now()}`,
      name: newUserName.trim(),
      role: newUserRole,
      pin: pinClean,
      active: true,
    };
    await db.staffUsers.put(created);
    await logAuditAction({
      brandId: activeBrand.id,
      action: 'CREAR_USUARIO',
      details: `Nuevo operador creado: ${created.name} (${created.role})`,
    });
    setNewUserName('');
    setNewUserPin('');
    showNotice(`Usuario ${created.name} agregado.`);
  };

  const handleToggleUserStatus = async (userId: string, current: boolean) => {
    await db.staffUsers.update(userId, { active: !current });
    showNotice('Estado de usuario actualizado.');
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (staffUsers.length <= 1) {
      showNotice('Debe existir al menos un usuario en el sistema.');
      return;
    }
    await db.staffUsers.delete(userId);
    await logAuditAction({
      brandId: activeBrand.id,
      action: 'ELIMINAR_USUARIO',
      details: `Usuario eliminado: ${name}`,
    });
    showNotice(`Usuario ${name} eliminado.`);
  };

  // Handlers de Códigos de Descuento
  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newPromoCode.trim().toUpperCase();
    if (!cleanCode || newPromoValue <= 0) return;

    await db.promoCodes.put({
      code: cleanCode,
      description:
        newPromoDesc.trim() ||
        (newPromoType === 'PERCENT'
          ? `Descuento ${newPromoValue}%`
          : `Bono RD$ ${newPromoValue}`),
      type: newPromoType,
      value: Number(newPromoValue),
      active: true,
    });
    await logAuditAction({
      brandId: activeBrand.id,
      action: 'CREAR_CODIGO_PROMO',
      details: `Código ${cleanCode} (${newPromoType === 'PERCENT' ? `${newPromoValue}%` : `RD$ ${newPromoValue}`}) creado`,
    });
    setNewPromoCode('');
    setNewPromoDesc('');
    showNotice(`Código promocional ${cleanCode} guardado.`);
  };

  const handleTogglePromo = async (code: string, current: boolean) => {
    await db.promoCodes.update(code, { active: !current });
    showNotice(`Código ${code} ${!current ? 'activado' : 'desactivado'}.`);
  };

  const handleDeletePromo = async (code: string) => {
    await db.promoCodes.delete(code);
    showNotice(`Código ${code} eliminado.`);
  };

  // Handlers de Mesas del Restaurante
  const handleDeleteTable = async (tableId: string, tableName: string) => {
    await db.restaurantTables.delete(tableId);
    await logAuditAction({
      brandId: activeBrand.id,
      action: 'ELIMINAR_MESA',
      details: `Mesa eliminada desde Configuración: ${tableName}`,
    });
    showNotice(`Mesa "${tableName}" eliminada.`);
  };

  const handleResetDefaultTables = async () => {
    await db.restaurantTables.clear();
    await db.restaurantTables.bulkPut(INITIAL_RESTAURANT_TABLES);
    await logAuditAction({
      brandId: activeBrand.id,
      action: 'RESTAURAR_MESAS',
      details: 'Mapa de mesas restaurado a los valores de fábrica',
    });
    showNotice('Mesas predeterminadas restauradas.');
  };

  // Exportar e Importar Copia de Seguridad Completa (.JSON)
  const handleExportBackupJson = async () => {
    try {
      const payload = {
        app: 'BridgePOS ERP',
        version: 5,
        exportedAt: new Date().toISOString(),
        data: {
          corporateConfig: await db.corporateConfig.toArray(),
          brands: await db.brands.toArray(),
          ncfSequences: await db.ncfSequences.toArray(),
          documents: await db.documents.toArray(),
          clients: await db.clients.toArray(),
          catalogItems: await db.catalogItems.toArray(),
          serviceOrders: await db.serviceOrders.toArray(),
          restaurantTables: await db.restaurantTables.toArray(),
          staffUsers: await db.staffUsers.toArray(),
          auditLogs: await db.auditLogs.toArray(),
          promoCodes: await db.promoCodes.toArray(),
          cashShifts: await db.cashShifts.toArray(),
        },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BridgePOS_Backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await logAuditAction({
        brandId: activeBrand.id,
        action: 'EXPORTAR_BACKUP_JSON',
        details: `Copia de seguridad descargada: BridgePOS_Backup_${dateStr}.json`,
      });
      showNotice(`Respaldo BridgePOS_Backup_${dateStr}.json descargado.`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al exportar respaldo.';
      showNotice(msg);
    }
  };

  const handleImportBackupJson = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const tablesData = parsed?.data || parsed;

      if (
        !tablesData ||
        typeof tablesData !== 'object' ||
        (!Array.isArray(tablesData.brands) &&
          !Array.isArray(tablesData.documents) &&
          !Array.isArray(tablesData.clients))
      ) {
        showNotice('Archivo JSON inválido: no contiene tablas de BridgePOS.');
        e.target.value = '';
        return;
      }

      await db.transaction(
        'rw',
        [
          db.corporateConfig,
          db.brands,
          db.ncfSequences,
          db.documents,
          db.clients,
          db.catalogItems,
          db.serviceOrders,
          db.restaurantTables,
          db.staffUsers,
          db.auditLogs,
          db.promoCodes,
          db.cashShifts,
        ],
        async () => {
          if (Array.isArray(tablesData.corporateConfig)) {
            await db.corporateConfig.clear();
            await db.corporateConfig.bulkPut(tablesData.corporateConfig);
          }
          if (Array.isArray(tablesData.brands)) {
            await db.brands.clear();
            await db.brands.bulkPut(tablesData.brands);
          }
          if (Array.isArray(tablesData.ncfSequences)) {
            await db.ncfSequences.clear();
            await db.ncfSequences.bulkPut(tablesData.ncfSequences);
          }
          if (Array.isArray(tablesData.documents)) {
            await db.documents.clear();
            await db.documents.bulkPut(tablesData.documents);
          }
          if (Array.isArray(tablesData.clients)) {
            await db.clients.clear();
            await db.clients.bulkPut(tablesData.clients);
          }
          if (Array.isArray(tablesData.catalogItems)) {
            await db.catalogItems.clear();
            await db.catalogItems.bulkPut(tablesData.catalogItems);
          }
          if (Array.isArray(tablesData.serviceOrders)) {
            await db.serviceOrders.clear();
            await db.serviceOrders.bulkPut(tablesData.serviceOrders);
          }
          if (Array.isArray(tablesData.restaurantTables)) {
            await db.restaurantTables.clear();
            await db.restaurantTables.bulkPut(tablesData.restaurantTables);
          }
          if (Array.isArray(tablesData.staffUsers)) {
            await db.staffUsers.clear();
            await db.staffUsers.bulkPut(tablesData.staffUsers);
          }
          if (Array.isArray(tablesData.auditLogs)) {
            await db.auditLogs.clear();
            await db.auditLogs.bulkPut(tablesData.auditLogs);
          }
          if (Array.isArray(tablesData.promoCodes)) {
            await db.promoCodes.clear();
            await db.promoCodes.bulkPut(tablesData.promoCodes);
          }
          if (Array.isArray(tablesData.cashShifts)) {
            await db.cashShifts.clear();
            await db.cashShifts.bulkPut(tablesData.cashShifts);
          }
        }
      );

      await logAuditAction({
        brandId: activeBrand.id,
        action: 'RESTAURAR_BACKUP_JSON',
        details: `Base de datos restaurada desde archivo: ${file.name}`,
      });
      e.target.value = '';
      showNotice('Base de datos restaurada exitosamente desde el archivo JSON.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al restaurar el archivo JSON.';
      showNotice(msg);
      e.target.value = '';
    }
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
      <div className="flex items-center justify-between border-b border-slate-200 overflow-x-auto">
        <div className="flex items-center gap-5 min-w-max">
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
            <span>Unidades de Negocio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('STAFF_USERS')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'STAFF_USERS'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuarios y Roles</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PROMO_CODES')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'PROMO_CODES'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Códigos de Descuento</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RESTAURANT_TABLES')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'RESTAURANT_TABLES'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Mesas del Restaurante</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('AUDIT_LOGS')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'AUDIT_LOGS'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Bitácora de Auditoría</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('BACKUP_JSON')}
            className={`inline-flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'BACKUP_JSON'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Respaldo / Backup JSON</span>
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
            <span>Vista Previa Factura</span>
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

      {/* TAB 3: GESTIÓN DE USUARIOS Y ROLES */}
      {activeTab === 'STAFF_USERS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Nuevo Operador / Usuario
                </h3>
                <p className="text-[11px] text-slate-500">
                  Asigna permisos y rol operativo
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Nombre Completo / Alias *
                </label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ej: María Fernanda (Caja 2)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Rol y Nivel de Acceso *
                </label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold focus:outline-none focus:border-slate-900"
                >
                  <option value="ADMIN">ADMIN (Acceso Total + Auditoría + Mesas)</option>
                  <option value="CAJERO">CAJERO (Ventas POS + Cuentas + Órdenes)</option>
                  <option value="CAMARERO">CAMARERO (Solo Salón Restaurante)</option>
                  <option value="TECNICO">TECNICO (Órdenes de Servicio / Taller)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  PIN de Acceso Rápido (4 dígitos)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value)}
                  placeholder="Ej: 4580"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:border-slate-900"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Usuario</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Plantilla de Personal y Roles ({staffUsers.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Puedes cambiar de operador activo en cualquier momento desde la barra superior
                </p>
              </div>
              <Shield className="w-4 h-4 text-slate-400" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Operador</th>
                    <th className="py-3 px-4">Rol Asignado</th>
                    <th className="py-3 px-4">PIN</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {staffUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {u.name}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            u.role === 'ADMIN'
                              ? 'bg-amber-100 text-amber-900'
                              : u.role === 'CAJERO'
                              ? 'bg-emerald-100 text-emerald-900'
                              : u.role === 'CAMARERO'
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-purple-100 text-purple-900'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {u.pin}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u.id, u.active)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer ${
                            u.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {u.active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CÓDIGOS DE DESCUENTO Y PROMOCIONES */}
      {activeTab === 'PROMO_CODES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Crear Código Promocional
                </h3>
                <p className="text-[11px] text-slate-500">
                  Válido en POS, Restaurante y Servicios
                </p>
              </div>
            </div>

            <form onSubmit={handleCreatePromo} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Código (Ej: VIP10, VERANO20) *
                </label>
                <input
                  type="text"
                  required
                  value={newPromoCode}
                  onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                  placeholder="VIP15"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Descripción / Motivo
                </label>
                <input
                  type="text"
                  value={newPromoDesc}
                  onChange={(e) => setNewPromoDesc(e.target.value)}
                  placeholder="Descuento Clientes Corporativos"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Tipo
                  </label>
                  <select
                    value={newPromoType}
                    onChange={(e) =>
                      setNewPromoType(e.target.value as 'PERCENT' | 'FIXED')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
                  >
                    <option value="PERCENT">Porcentaje (%)</option>
                    <option value="FIXED">Monto Fijo (RD$)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Valor *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newPromoValue}
                    onChange={(e) => setNewPromoValue(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Guardar Código</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Códigos de Descuento Activos ({promoCodes.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Los cajeros pueden escribir estos códigos al facturar en cualquiera de las marcas
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Descripción</th>
                    <th className="py-3 px-4">Beneficio</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {promoCodes.map((p) => (
                    <tr key={p.code} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-teal-800">
                        {p.code}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {p.description}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {p.type === 'PERCENT'
                          ? `${p.value}% OFF`
                          : `RD$ ${p.value.toLocaleString('es-DO')}`}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleTogglePromo(p.code, p.active)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer ${
                            p.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {p.active ? 'Activo' : 'Pausado'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeletePromo(p.code)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Eliminar código"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: GESTIÓN DE MESAS DEL RESTAURANTE */}
      {activeTab === 'RESTAURANT_TABLES' && (
        <div className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Administración de Mesas del Restaurante ({restaurantTables.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Elimina mesas que ya no utilices o restaura el plano original del salón
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetDefaultTables}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Mesas Predeterminadas</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Nombre de Mesa</th>
                  <th className="py-3 px-4">Zona</th>
                  <th className="py-3 px-4">Capacidad</th>
                  <th className="py-3 px-4">Estado Actual</th>
                  <th className="py-3 px-4 text-right">Eliminar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-xs">
                {restaurantTables.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-slate-500">{t.id}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{t.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                        {t.zone}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {t.capacity} personas
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === 'LIBRE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {t.status} ({t.items.length} ítems)
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteTable(t.id, t.name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: BITÁCORA DE AUDITORÍA */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="bg-white rounded-xl border border-slate-200/90 overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Bitácora de Auditoría de Operaciones ({auditLogs.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Registro histórico de facturación, descuentos, cambios de usuario y aperturas/cierres de mesas
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Buscar por usuario o acción..."
                  className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-slate-900"
                />
              </div>
              <select
                value={auditRoleFilter}
                onChange={(e) => setAuditRoleFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium"
              >
                <option value="ALL">Todos los roles</option>
                <option value="ADMIN">ADMIN</option>
                <option value="CAJERO">CAJERO</option>
                <option value="CAMARERO">CAMARERO</option>
                <option value="TECNICO">TECNICO</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Fecha / Hora</th>
                  <th className="py-3 px-4">Operador</th>
                  <th className="py-3 px-4">Rol</th>
                  <th className="py-3 px-4">Marca</th>
                  <th className="py-3 px-4">Acción</th>
                  <th className="py-3 px-4">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-xs">
                {auditLogs
                  .filter((log) => {
                    if (
                      auditRoleFilter !== 'ALL' &&
                      log.userRole !== auditRoleFilter
                    ) {
                      return false;
                    }
                    if (!auditSearch.trim()) return true;
                    const q = auditSearch.toLowerCase();
                    return (
                      log.userName.toLowerCase().includes(q) ||
                      log.action.toLowerCase().includes(q) ||
                      log.details.toLowerCase().includes(q) ||
                      log.brandId.toLowerCase().includes(q)
                    );
                  })
                  .map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('es-DO')}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {log.userName}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {log.userRole}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                        {log.brandId}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-teal-800 text-[11px]">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-slate-400 text-xs"
                    >
                      Aún no hay eventos registrados en la bitácora de auditoría.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: RESPALDO / BACKUP Y RESTAURACIÓN (.JSON) */}
      {activeTab === 'BACKUP_JSON' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* EXPORTAR BACKUP JSON */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between gap-5">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <Download className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Descargar Copia de Seguridad Completa (.JSON)
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Exporta todas las tablas de IndexedDB (Secuencias NCF,
                  Comprobantes Emitidos, Clientes, Catálogo, Órdenes de Servicio,
                  Mesas, Usuarios, Bitácora, Códigos Promocionales y Cortes de
                  Caja) en un archivo portable{' '}
                  <code className="font-mono text-slate-800">
                    BridgePOS_Backup_YYYY-MM-DD.json
                  </code>
                  .
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportBackupJson}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-teal-400" />
              <span>Descargar Copia de Seguridad (.json)</span>
            </button>
          </div>

          {/* IMPORTAR / RESTAURAR BACKUP JSON */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col justify-between gap-5">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Restaurar Base de Datos (.JSON)
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Carga un archivo{' '}
                  <code className="font-mono text-slate-800">.json</code>{' '}
                  generado previamente por BridgePOS para migrar entre
                  computadoras, tablets o celulares sin perder secuencias NCF ni
                  historial fiscal.
                </p>
              </div>
            </div>

            <label className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-900 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <Upload className="w-4 h-4 text-slate-700" />
              <span>Seleccionar Archivo .json para Restaurar</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportBackupJson}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
