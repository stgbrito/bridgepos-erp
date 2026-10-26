import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Check,
  Edit3,
  MessageCircle,
  Package,
  Plus,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  db,
  logAuditAction,
  type BrandId,
  type BrandProfile,
  type CatalogItem,
  type ClientProfile,
} from '../db/db';

interface ClientsCatalogViewProps {
  activeBrand: BrandProfile;
  clients: ClientProfile[];
  catalogItems: CatalogItem[];
}

const DEFAULT_CATEGORIES_BY_BRAND: Record<BrandId, string[]> = {
  'bridge-tech': [
    'Smart Home',
    'Redes & IT',
    'Seguridad Electrónica',
    'Software',
    'Equipos & Accesorios',
  ],
  atelier: ['Alta Costura', 'Nupcial', 'Uniformes', 'Sastrería', 'Telas & Insumos'],
  'sb-mantenimiento': [
    'Climatización',
    'Mantenimiento',
    'Electricidad',
    'Repuestos',
    'Plomería',
  ],
  'metro-food': [
    'Platos Fuertes',
    'Parrilla',
    'Bebidas',
    'Postres',
    'Entradas',
    'Eventos',
  ],
};

const STANDARD_UNITS: { code: string; label: string }[] = [
  { code: 'UND', label: 'UND • Unidad' },
  { code: 'SERV', label: 'SERV • Servicio' },
  { code: 'PZA', label: 'PZA • Pieza' },
  { code: 'PROY', label: 'PROY • Proyecto' },
  { code: 'ORD', label: 'ORD • Orden / Plato' },
  { code: 'KIT', label: 'KIT • Kit Completo' },
  { code: 'SET', label: 'SET • Conjunto / Set' },
  { code: 'LIC', label: 'LIC • Licencia' },
  { code: 'MTS', label: 'MTS • Metros' },
  { code: 'LB', label: 'LB • Libras' },
  { code: 'GAL', label: 'GAL • Galón' },
];

function getBrandShortPrefix(brandId: BrandId): string {
  switch (brandId) {
    case 'bridge-tech':
      return 'BT';
    case 'atelier':
      return 'AT';
    case 'sb-mantenimiento':
      return 'SB';
    case 'metro-food':
      return 'MF';
  }
}

function buildSmartSku(
  brandId: BrandId,
  category: string,
  existingItems: CatalogItem[]
): string {
  const brandPrefix = getBrandShortPrefix(brandId);
  const cleanCat = (category || 'GEN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  const catPrefix = (cleanCat.slice(0, 3) || 'GEN').padEnd(3, 'X');
  const nextNum = existingItems.filter((i) => i.brandId === brandId).length + 1;
  return `${brandPrefix}-${catPrefix}-${String(nextNum).padStart(2, '0')}`;
}

export const ClientsCatalogView: React.FC<ClientsCatalogViewProps> = ({
  activeBrand,
  clients,
  catalogItems,
}) => {
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'CLIENTS'>('CATALOG');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

  // Órdenes de Servicio para calcular Estado de Cuenta / Balance Pendiente (Cuentas por Cobrar)
  const serviceOrders =
    useLiveQuery(() => db.serviceOrders.toArray(), []) ?? [];

  // Modal de Catálogo (Crear / Editar Servicio o Producto)
  const [itemModalOpen, setItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [itemCode, setItemCode] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<string>('');
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);
  const [customCategoryText, setCustomCategoryText] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<string>('SERV');
  const [isCustomUnit, setIsCustomUnit] = useState<boolean>(false);
  const [customUnitText, setCustomUnitText] = useState<string>('');
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [itemIsService, setItemIsService] = useState<boolean>(true);
  const [itemStock, setItemStock] = useState<number>(10);
  const [itemStation, setItemStation] = useState<'COCINA' | 'BAR'>('COCINA');

  // Modal de Cliente (Crear / Editar Cliente + Medidas Atelier)
  const [clientModalOpen, setClientModalOpen] = useState<boolean>(false);
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(
    null
  );
  const [clientName, setClientName] = useState<string>('');
  const [clientRnc, setClientRnc] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>('');
  const [clientPreferredNcf, setClientPreferredNcf] = useState<'B01' | 'B02'>(
    'B01'
  );
  const [clientNotes, setClientNotes] = useState<string>('');
  const [measBust, setMeasBust] = useState<string>('');
  const [measWaist, setMeasWaist] = useState<string>('');
  const [measHips, setMeasHips] = useState<string>('');
  const [measLength, setMeasLength] = useState<string>('');

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Categorías dinámicas combinando las predefinidas + las ya guardadas en la marca
  const availableCategories = useMemo(() => {
    const defaults = DEFAULT_CATEGORIES_BY_BRAND[activeBrand.id] || ['General'];
    const fromDb = catalogItems
      .filter((i) => i.brandId === activeBrand.id)
      .map((i) => i.category);
    return Array.from(new Set([...defaults, ...fromDb]));
  }, [activeBrand.id, catalogItems]);

  // Filtrar catálogo por la unidad de negocio activa
  const brandCatalog = catalogItems.filter(
    (item) =>
      item.brandId === activeBrand.id &&
      (!searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Filtrar clientes
  const filteredClients = clients.filter(
    (c) =>
      !searchQuery.trim() ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.rncOrCedula.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Abrir modal de ítem
  const handleOpenItemModal = (item?: CatalogItem) => {
    if (item) {
      setEditingItem(item);
      setItemCode(item.code);
      setItemName(item.name);
      setItemCategory(item.category);
      setIsCustomCategory(false);
      setCustomCategoryText('');
      const unitExists = STANDARD_UNITS.some((u) => u.code === item.unit);
      setItemUnit(unitExists ? item.unit : 'UND');
      setIsCustomUnit(!unitExists);
      setCustomUnitText(!unitExists ? item.unit : '');
      setItemPrice(item.price);
      setItemIsService(item.isService);
      setItemStock(item.stock ?? 10);
      setItemStation(item.station || 'COCINA');
    } else {
      setEditingItem(null);
      const defaultCat = availableCategories[0] || 'General';
      setItemCategory(defaultCat);
      setIsCustomCategory(false);
      setCustomCategoryText('');
      setItemCode(buildSmartSku(activeBrand.id, defaultCat, catalogItems));
      setItemName('');
      setItemUnit(activeBrand.id === 'metro-food' ? 'UND' : 'SERV');
      setIsCustomUnit(false);
      setCustomUnitText('');
      setItemPrice(0);
      setItemIsService(activeBrand.id !== 'metro-food');
      setItemStock(20);
      setItemStation('COCINA');
    }
    setItemModalOpen(true);
  };

  // Al cambiar de categoría en modo creación, actualizar el código inteligente sugerido
  const handleCategoryChange = (val: string) => {
    if (val === '__NEW__') {
      setIsCustomCategory(true);
      setCustomCategoryText('');
      return;
    }
    setIsCustomCategory(false);
    setItemCategory(val);
    if (!editingItem) {
      setItemCode(buildSmartSku(activeBrand.id, val, catalogItems));
    }
    if (activeBrand.id === 'metro-food') {
      setItemStation(val.toLowerCase().includes('bebida') ? 'BAR' : 'COCINA');
    }
  };

  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const finalCategory = isCustomCategory
      ? customCategoryText.trim() || 'General'
      : itemCategory.trim() || 'General';

    const finalUnit = isCustomUnit
      ? customUnitText.trim().toUpperCase() || 'UND'
      : itemUnit.trim().toUpperCase() || 'UND';

    const payload: CatalogItem = {
      ...(editingItem?.id ? { id: editingItem.id } : {}),
      brandId: activeBrand.id,
      code:
        itemCode.trim().toUpperCase() ||
        buildSmartSku(activeBrand.id, finalCategory, catalogItems),
      name: itemName.trim(),
      category: finalCategory,
      unit: finalUnit,
      price: Math.max(0, Number(itemPrice)),
      isService: itemIsService,
      stock: itemIsService ? undefined : Math.max(0, Number(itemStock)),
      station: activeBrand.id === 'metro-food' ? itemStation : undefined,
      active: true,
    };

    await db.catalogItems.put(payload);
    await logAuditAction({
      brandId: activeBrand.id,
      action: editingItem ? 'EDITAR_CATALOGO' : 'CREAR_CATALOGO',
      details: `${payload.code} - ${payload.name} (RD$ ${payload.price})`,
    });

    setItemModalOpen(false);
    showNotice(
      editingItem ? 'Ítem actualizado en el catálogo.' : 'Nuevo ítem agregado.'
    );
  };

  const handleDeleteCatalogItem = async (item: CatalogItem) => {
    if (!item.id) return;
    await db.catalogItems.delete(item.id);
    await logAuditAction({
      brandId: activeBrand.id,
      action: 'ELIMINAR_CATALOGO',
      details: `Eliminado ítem ${item.code} - ${item.name}`,
    });
    showNotice('Ítem eliminado del catálogo.');
  };

  // Abrir modal de cliente
  const handleOpenClientModal = (client?: ClientProfile) => {
    if (client) {
      setEditingClient(client);
      setClientName(client.name);
      setClientRnc(client.rncOrCedula);
      setClientPhone(client.phone);
      setClientEmail(client.email || '');
      setClientPreferredNcf(client.preferredNcfType);
      setClientNotes(client.notes || '');
      setMeasBust(client.measurements?.bust || '');
      setMeasWaist(client.measurements?.waist || '');
      setMeasHips(client.measurements?.hips || '');
      setMeasLength(client.measurements?.length || '');
    } else {
      setEditingClient(null);
      setClientName('');
      setClientRnc('');
      setClientPhone('');
      setClientEmail('');
      setClientPreferredNcf('B01');
      setClientNotes('');
      setMeasBust('');
      setMeasWaist('');
      setMeasHips('');
      setMeasLength('');
    }
    setClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    const hasMeas =
      measBust.trim() ||
      measWaist.trim() ||
      measHips.trim() ||
      measLength.trim();

    const payload: ClientProfile = {
      ...(editingClient?.id ? { id: editingClient.id } : {}),
      name: clientName.trim(),
      rncOrCedula: clientRnc.trim(),
      phone: clientPhone.trim(),
      email: clientEmail.trim(),
      preferredNcfType: clientPreferredNcf,
      notes: clientNotes.trim(),
      measurements: hasMeas
        ? {
            bust: measBust.trim(),
            waist: measWaist.trim(),
            hips: measHips.trim(),
            length: measLength.trim(),
          }
        : undefined,
      createdAt: editingClient?.createdAt || new Date().toISOString(),
    };

    await db.clients.put(payload);
    setClientModalOpen(false);
    showNotice(
      editingClient ? 'Datos del cliente actualizados.' : 'Cliente registrado.'
    );
  };

  const handleDeleteClient = async (id?: number) => {
    if (!id) return;
    await db.clients.delete(id);
    showNotice('Cliente eliminado.');
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-lg">
          <Check className="w-4 h-4 text-teal-400" />
          <span>{notice}</span>
        </div>
      )}

      {/* TABS Y BUSCADOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('CATALOG')}
            className={`inline-flex items-center gap-2 pb-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'CATALOG'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Catálogo • {activeBrand.name}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CLIENTS')}
            className={`inline-flex items-center gap-2 pb-2 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'CLIENTS'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Directorio de Clientes ({clients.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'CATALOG'
                  ? 'Buscar servicio o código...'
                  : 'Buscar cliente o RNC...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 w-52 focus:outline-none focus:border-slate-400"
            />
          </div>

          {activeTab === 'CATALOG' ? (
            <button
              type="button"
              onClick={() => handleOpenItemModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Ítem</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenClientModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Cliente</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: CATÁLOGO DE LA MARCA ACTIVA */}
      {activeTab === 'CATALOG' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Código</th>
                  <th className="py-3.5 px-4">Servicio / Producto</th>
                  <th className="py-3.5 px-4">Categoría</th>
                  <th className="py-3.5 px-4">Tipo / Stock</th>
                  <th className="py-3.5 px-4">Unidad</th>
                  <th className="py-3.5 px-4 text-right">Precio RD$</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-xs">
                {brandCatalog.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                      {item.code}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {item.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {item.isService ? (
                        <span className="text-[11px] text-sky-700 font-medium">
                          Servicio
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] text-emerald-700 font-semibold">
                          Stock: {item.stock ?? 0}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {item.unit}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      RD${' '}
                      {item.price.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenItemModal(item)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCatalogItem(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DIRECTORIO DE CLIENTES */}
      {activeTab === 'CLIENTS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClients.map((client) => {
            const cleanDigits = client.phone.replace(/\D/g, '');
            const waPhone =
              cleanDigits.length === 10 ? `1${cleanDigits}` : cleanDigits;

            const clientOpenOrders = serviceOrders.filter(
              (o) =>
                o.status !== 'COTIZACION' &&
                o.balanceDue > 0 &&
                (o.clientId === client.id ||
                  o.clientName.trim().toLowerCase() ===
                    client.name.trim().toLowerCase())
            );
            const totalPendingBalance = clientOpenOrders.reduce(
              (acc, o) => acc + o.balanceDue,
              0
            );

            return (
              <div
                key={client.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {client.name}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                        <span>RNC/Céd: {client.rncOrCedula || '—'}</span>
                        <span>•</span>
                        <span>Tel: {client.phone}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-[11px]">
                        NCF Pref: {client.preferredNcfType}
                      </span>
                      {totalPendingBalance > 0 && (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-100 border border-amber-300 text-amber-900 font-mono font-bold text-[11px]">
                          Pendiente: RD${' '}
                          {totalPendingBalance.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {client.notes && (
                    <p className="text-xs text-slate-500">{client.notes}</p>
                  )}

                  {clientOpenOrders.length > 0 && (
                    <div className="rounded-xl bg-amber-50/70 border border-amber-200/90 p-3 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                        Estado de Cuenta • Órdenes Abiertas ({clientOpenOrders.length})
                      </span>
                      <div className="space-y-1">
                        {clientOpenOrders.map((ord) => (
                          <div
                            key={ord.id}
                            className="flex items-center justify-between text-[11px] font-mono text-amber-950"
                          >
                            <span className="truncate pr-2">
                              {ord.orderCode} • {ord.status}
                            </span>
                            <span className="font-bold shrink-0">
                              RD${' '}
                              {ord.balanceDue.toLocaleString('es-DO', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {client.measurements && (
                    <div className="rounded-xl bg-stone-50 border border-stone-200/80 p-3 space-y-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-stone-700">
                        <Ruler className="w-3 h-3 text-amber-600" />
                        <span>Medidas Guardadas (Atelier)</span>
                      </span>
                      <div className="grid grid-cols-4 gap-2 text-[11px] font-mono text-stone-700">
                        <div>Busto: {client.measurements.bust || '—'}</div>
                        <div>Cintura: {client.measurements.waist || '—'}</div>
                        <div>Cadera: {client.measurements.hips || '—'}</div>
                        <div>Largo: {client.measurements.length || '—'}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <a
                    href={`https://wa.me/${waPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-600"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Contactar por WhatsApp</span>
                  </a>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenClientModal(client)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClient(client.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE ÍTEM DE CATÁLOGO CON DROPDOWNS Y AUTOCOMPLETADO INTELIGENTE */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingItem ? 'Editar Ítem' : 'Nuevo Servicio / Producto'}
              </h3>
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveCatalogItem}
              className="p-6 space-y-4 text-xs"
            >
              {/* CATEGORÍA CON DROPDOWN + OPCIÓN CREAR NUEVA */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Categoría
                  </label>
                  <select
                    value={isCustomCategory ? '__NEW__' : itemCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white font-medium"
                  >
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__NEW__">+ Crear nueva categoría...</option>
                  </select>
                  {isCustomCategory && (
                    <input
                      type="text"
                      required
                      placeholder="Nombre de nueva categoría"
                      value={customCategoryText}
                      onChange={(e) => {
                        setCustomCategoryText(e.target.value);
                        if (!editingItem) {
                          setItemCode(
                            buildSmartSku(
                              activeBrand.id,
                              e.target.value,
                              catalogItems
                            )
                          );
                        }
                      }}
                      className="w-full mt-1.5 rounded-xl border border-teal-400 px-3 py-1.5"
                    />
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-slate-600">
                      Código (Auto)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setItemCode(
                          buildSmartSku(
                            activeBrand.id,
                            isCustomCategory ? customCategoryText : itemCategory,
                            catalogItems
                          )
                        )
                      }
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-teal-700 hover:text-teal-600"
                      title="Sugerir código automático"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Sugerir</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-600 block mb-1">
                  Descripción del Servicio o Producto *
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Ej. Instalación A/C Split o Vestido de Gala"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Unidad de Medida
                  </label>
                  <select
                    value={isCustomUnit ? '__OTHER__' : itemUnit}
                    onChange={(e) => {
                      if (e.target.value === '__OTHER__') {
                        setIsCustomUnit(true);
                        setCustomUnitText('');
                      } else {
                        setIsCustomUnit(false);
                        setItemUnit(e.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white font-mono"
                  >
                    {STANDARD_UNITS.map((u) => (
                      <option key={u.code} value={u.code}>
                        {u.label}
                      </option>
                    ))}
                    <option value="__OTHER__">+ Otra unidad...</option>
                  </select>
                  {isCustomUnit && (
                    <input
                      type="text"
                      required
                      placeholder="Ej. CAJA, PAR, HRS"
                      value={customUnitText}
                      onChange={(e) => setCustomUnitText(e.target.value)}
                      className="w-full mt-1.5 rounded-xl border border-teal-400 px-3 py-1.5 font-mono uppercase"
                    />
                  )}
                </div>

                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Precio RD$
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={itemPrice}
                    onChange={(e) => setItemPrice(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono font-bold"
                  />
                </div>
              </div>

              {/* TIPO DE ÍTEM (SERVICIO VS PRODUCTO CON STOCK) + ESTACIÓN EN RESTAURANTE */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Naturaleza del Ítem
                  </label>
                  <select
                    value={itemIsService ? 'SERVICE' : 'PRODUCT'}
                    onChange={(e) =>
                      setItemIsService(e.target.value === 'SERVICE')
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                  >
                    <option value="SERVICE">Servicio / Mano de Obra</option>
                    <option value="PRODUCT">Producto Físico (Con Stock)</option>
                  </select>
                </div>

                {!itemIsService ? (
                  <div>
                    <label className="font-medium text-slate-600 block mb-1">
                      Stock Disponible
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={itemStock}
                      onChange={(e) => setItemStock(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono font-bold"
                    />
                  </div>
                ) : activeBrand.id === 'metro-food' ? (
                  <div>
                    <label className="font-medium text-slate-600 block mb-1">
                      Estación de Comanda
                    </label>
                    <select
                      value={itemStation}
                      onChange={(e) =>
                        setItemStation(e.target.value as 'COCINA' | 'BAR')
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white font-bold"
                    >
                      <option value="COCINA">COCINA</option>
                      <option value="BAR">BAR / BEBIDAS</option>
                    </select>
                  </div>
                ) : null}
              </div>

              {activeBrand.id === 'metro-food' && !itemIsService && (
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Estación de Comanda (Restaurante)
                  </label>
                  <select
                    value={itemStation}
                    onChange={(e) =>
                      setItemStation(e.target.value as 'COCINA' | 'BAR')
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white font-bold"
                  >
                    <option value="COCINA">COCINA (Platos / Postres)</option>
                    <option value="BAR">BAR (Bebidas / Tragos)</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CLIENTE + MEDIDAS ATELIER */}
      {clientModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h3>
              <button
                type="button"
                onClick={() => setClientModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveClient}
              className="p-6 space-y-4 text-xs"
            >
              <div>
                <label className="font-medium text-slate-600 block mb-1">
                  Nombre o Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    RNC / Cédula
                  </label>
                  <input
                    type="text"
                    value={clientRnc}
                    onChange={(e) => setClientRnc(e.target.value)}
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    NCF Preferido
                  </label>
                  <select
                    value={clientPreferredNcf}
                    onChange={(e) =>
                      setClientPreferredNcf(e.target.value as 'B01' | 'B02')
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white font-mono"
                  >
                    <option value="B01">B01 • Crédito Fiscal</option>
                    <option value="B02">B02 • Consumo</option>
                  </select>
                </div>
              </div>

              {/* MEDIDAS OPCIONALES PARA ATELIER */}
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3.5 space-y-2">
                <span className="font-semibold text-stone-800 block">
                  Medidas de Confección (Opcional • Atelier)
                </span>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-[10px] text-stone-500 block mb-0.5">
                      Busto
                    </label>
                    <input
                      type="text"
                      placeholder="92 cm"
                      value={measBust}
                      onChange={(e) => setMeasBust(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-500 block mb-0.5">
                      Cintura
                    </label>
                    <input
                      type="text"
                      placeholder="70 cm"
                      value={measWaist}
                      onChange={(e) => setMeasWaist(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-500 block mb-0.5">
                      Cadera
                    </label>
                    <input
                      type="text"
                      placeholder="98 cm"
                      value={measHips}
                      onChange={(e) => setMeasHips(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-500 block mb-0.5">
                      Largo
                    </label>
                    <input
                      type="text"
                      placeholder="148 cm"
                      value={measLength}
                      onChange={(e) => setMeasLength(e.target.value)}
                      className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-600 block mb-1">
                  Notas / Observaciones
                </label>
                <input
                  type="text"
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setClientModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
