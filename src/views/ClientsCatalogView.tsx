import React, { useState } from 'react';
import {
  Check,
  Edit3,
  MessageCircle,
  Package,
  Plus,
  Ruler,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  db,
  type BrandProfile,
  type CatalogItem,
  type ClientProfile,
} from '../db/db';

interface ClientsCatalogViewProps {
  activeBrand: BrandProfile;
  clients: ClientProfile[];
  catalogItems: CatalogItem[];
}

export const ClientsCatalogView: React.FC<ClientsCatalogViewProps> = ({
  activeBrand,
  clients,
  catalogItems,
}) => {
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'CLIENTS'>('CATALOG');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

  // Modal de Catálogo (Crear / Editar Servicio o Producto)
  const [itemModalOpen, setItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [itemCode, setItemCode] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [itemCategory, setItemCategory] = useState<string>('');
  const [itemUnit, setItemUnit] = useState<string>('SERV');
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [itemIsService, setItemIsService] = useState<boolean>(true);
  const [itemStock, setItemStock] = useState<number>(10);

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
      setItemUnit(item.unit);
      setItemPrice(item.price);
      setItemIsService(item.isService);
      setItemStock(item.stock ?? 0);
    } else {
      setEditingItem(null);
      const prefix = activeBrand.id.slice(0, 2).toUpperCase();
      setItemCode(`${prefix}-${String(brandCatalog.length + 1).padStart(2, '0')}`);
      setItemName('');
      setItemCategory('General');
      setItemUnit('SERV');
      setItemPrice(0);
      setItemIsService(true);
      setItemStock(10);
    }
    setItemModalOpen(true);
  };

  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const payload: CatalogItem = {
      ...(editingItem?.id ? { id: editingItem.id } : {}),
      brandId: activeBrand.id,
      code: itemCode.trim().toUpperCase() || 'ITEM-01',
      name: itemName.trim(),
      category: itemCategory.trim() || 'General',
      unit: itemUnit.trim().toUpperCase() || 'UND',
      price: Math.max(0, Number(itemPrice)),
      isService: itemIsService,
      stock: itemIsService ? undefined : Math.max(0, Number(itemStock)),
      active: true,
    };

    await db.catalogItems.put(payload);
    setItemModalOpen(false);
    showNotice(
      editingItem ? 'Ítem actualizado en el catálogo.' : 'Nuevo ítem agregado.'
    );
  };

  const handleDeleteCatalogItem = async (id?: number) => {
    if (!id) return;
    await db.catalogItems.delete(id);
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
                          onClick={() => handleDeleteCatalogItem(item.id)}
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

            return (
              <div
                key={client.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
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

                    <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 font-mono font-bold text-[11px]">
                      NCF Pref: {client.preferredNcfType}
                    </span>
                  </div>

                  {client.notes && (
                    <p className="text-xs text-slate-500">{client.notes}</p>
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

      {/* MODAL DE ÍTEM DE CATÁLOGO */}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Código
                  </label>
                  <input
                    type="text"
                    required
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">
                    Unidad (SERV, UND, PIEZA)
                  </label>
                  <input
                    type="text"
                    value={itemUnit}
                    onChange={(e) => setItemUnit(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono"
                  />
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
