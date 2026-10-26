import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Utensils,
  Users,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  Split,
  Clock,
  Sparkles,
  UserCheck,
  Receipt,
  CreditCard,
  Banknote,
  Landmark,
  ShieldCheck,
  Search,
  ChefHat,
  MessageSquare,
  CheckSquare,
  Square,
  X,
  Wine,
  ArrowLeftRight,
  Gift,
  ShoppingBag,
  Truck,
  RotateCcw,
  Tag,
  PlusCircle,
  Ban,
} from 'lucide-react';
import {
  db,
  INITIAL_PROMO_CODES,
  INITIAL_STAFF_USERS,
  logAuditAction,
  type BrandProfile,
  type CorporateConfig,
  type NCFSequence,
  type RestaurantTableAccount,
  type RestaurantZone,
  type RestaurantOrderType,
  type CatalogItem,
  type InvoiceItem,
  type InvoiceItemExtra,
  type NCFType,
  type PaymentMethod,
  type StaffUser,
} from '../db/db';
import {
  calculateInvoiceTotals,
  issueDocumentTransaction,
  roundCurrency,
} from '../services/fiscalService';
import {
  InvoicePrintModal,
  type PrintableDocumentData,
  type KitchenTicketBlock,
} from '../components/InvoicePrintModal';

interface RestaurantViewProps {
  activeBrand: BrandProfile;
  corporate: CorporateConfig;
  ncfSequences: NCFSequence[];
  tables: RestaurantTableAccount[];
  catalogItems: CatalogItem[];
}

const KITCHEN_PRESETS = [
  'Sin cebolla',
  'Bien cocido',
  'Término medio',
  'Salsa aparte',
  'Sin hielo',
  'Empacar para llevar',
];

const EXTRA_PRESETS: { name: string; price: number }[] = [
  { name: 'Queso Extra', price: 75 },
  { name: 'Tocineta Crispy', price: 95 },
  { name: 'Carne Smash Extra', price: 180 },
  { name: 'Papas Rústicas Extra', price: 120 },
  { name: 'Aguacate', price: 80 },
  { name: 'Huevo Frito', price: 60 },
];

function formatMoney(value: number): string {
  return `RD$ ${value.toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function inferStation(dish: CatalogItem): 'COCINA' | 'BAR' {
  if (dish.station) return dish.station;
  const cat = dish.category.toLowerCase();
  if (cat.includes('bebida') || cat.includes('bar') || cat.includes('trago')) {
    return 'BAR';
  }
  return 'COCINA';
}

function inferCourse(dish: CatalogItem): InvoiceItem['course'] {
  const cat = dish.category.toLowerCase();
  if (cat.includes('bebida')) return 'BEBIDA';
  if (cat.includes('postre')) return 'POSTRE';
  if (cat.includes('entrada')) return 'ENTRADA';
  return 'FUERTE';
}

export const RestaurantView: React.FC<RestaurantViewProps> = ({
  activeBrand,
  corporate,
  ncfSequences,
  tables,
  catalogItems,
}) => {
  const [selectedZone, setSelectedZone] = useState<'ALL' | RestaurantZone>('ALL');
  const [selectedTableId, setSelectedTableId] = useState<string>(
    tables[0]?.id || 'mesa-01'
  );

  // Usuario activo y permisos por rol
  const staffUsers =
    useLiveQuery(() => db.staffUsers.toArray(), []) ?? INITIAL_STAFF_USERS;
  const promoCodes =
    useLiveQuery(() => db.promoCodes.toArray(), []) ?? INITIAL_PROMO_CODES;

  const [activeUserId, setActiveUserId] = useState<string>(() =>
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('bridgepos_active_user_id') || 'user-admin'
      : 'user-admin'
  );

  useEffect(() => {
    const syncUser = () => {
      if (typeof localStorage !== 'undefined') {
        setActiveUserId(
          localStorage.getItem('bridgepos_active_user_id') || 'user-admin'
        );
      }
    };
    window.addEventListener('bridgepos-user-changed', syncUser);
    return () => window.removeEventListener('bridgepos-user-changed', syncUser);
  }, []);

  const currentUser: StaffUser =
    staffUsers.find((u) => u.id === activeUserId) || INITIAL_STAFF_USERS[0];
  const isAdmin = currentUser.role === 'ADMIN';

  // Reloj en tiempo real para cronómetro de mesas ocupadas
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Filtros de Menú, Notas de Cocina y Extras
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [expandedNoteItemId, setExpandedNoteItemId] = useState<string | null>(
    null
  );
  const [customExtraName, setCustomExtraName] = useState<string>('');
  const [customExtraPrice, setCustomExtraPrice] = useState<string>('');

  // Modo Cobrar Sin Impuestos (0% ITBIS) y Descuentos / Cupones
  const [exemptItbisOnTable, setExemptItbisOnTable] = useState<boolean>(false);
  const [promoCodeInput, setPromoCodeInput] = useState<string>('');
  const [appliedPromoCode, setAppliedPromoCode] = useState<string>('');
  const [globalDiscountType, setGlobalDiscountType] = useState<
    'PERCENT' | 'FIXED'
  >('PERCENT');
  const [globalDiscountVal, setGlobalDiscountVal] = useState<number>(0);

  // Split Bill Real (Completa, Partes Iguales o Por Ítems)
  const [splitMode, setSplitMode] = useState<'FULL' | 'PARTS' | 'ITEMS'>('FULL');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [selectedSplitItemIds, setSelectedSplitItemIds] = useState<string[]>([]);

  // Pestaña Móvil Activa para Camareros (< 1024px)
  const [mobileSectionTab, setMobileSectionTab] = useState<
    'TABLES' | 'MENU' | 'BILL'
  >('TABLES');

  // Propina Voluntaria / Extra Camarero (No altera base ITBIS ni 607)
  const [voluntaryTipInput, setVoluntaryTipInput] = useState<string>('');

  // Modal de Nueva Mesa
  const [showNewTableModal, setShowNewTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableZone, setNewTableZone] = useState<RestaurantZone>('SALON');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);

  // Modal de Transferir / Unir Mesas
  const [showMoveMergeModal, setShowMoveMergeModal] = useState(false);
  const [targetTableId, setTargetTableId] = useState<string>('');

  // Modal de Confirmación Vaciar/Liberar Mesa y Eliminar Mesa
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [confirmDeleteTableModal, setConfirmDeleteTableModal] = useState(false);

  // Modal de Cobro / Facturación
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutType, setCheckoutType] = useState<
    'FULL' | 'PART_SHARE' | 'SELECTED_ITEMS'
  >('FULL');
  const [isFiscal, setIsFiscal] = useState<boolean>(false);
  const [ncfType, setNcfType] = useState<NCFType>('B02');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');
  const [customCustomerName, setCustomCustomerName] =
    useState<string>('Consumidor Final');
  const [customCustomerRnc, setCustomCustomerRnc] = useState<string>('');
  const [customCustomerPhone, setCustomCustomerPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Modal de Impresión
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const filteredTables = useMemo(() => {
    if (selectedZone === 'ALL') return tables;
    return tables.filter((t) => t.zone === selectedZone);
  }, [tables, selectedZone]);

  const activeTable = useMemo(() => {
    return tables.find((t) => t.id === selectedTableId) || tables[0];
  }, [tables, selectedTableId]);

  const brandMenu = useMemo(() => {
    const items = catalogItems.filter(
      (i) => i.brandId === activeBrand.id && i.active
    );
    return items.length > 0 ? items : catalogItems.filter((i) => i.active);
  }, [catalogItems, activeBrand.id]);

  const menuCategories = useMemo(() => {
    return ['ALL', ...Array.from(new Set(brandMenu.map((m) => m.category)))];
  }, [brandMenu]);

  const filteredMenuItems = useMemo(() => {
    return brandMenu.filter((item) => {
      const matchesCat =
        selectedCategory === 'ALL' || item.category === selectedCategory;
      const q = menuSearch.trim().toLowerCase();
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [brandMenu, selectedCategory, menuSearch]);

  // Normaliza ítems cuando son cortesía (precio efectivo 0)
  const effectiveTableItems = useMemo(() => {
    return (activeTable?.items || []).map((i) =>
      i.isCourtesy ? { ...i, unitPrice: 0, discount: 0, extras: [] } : i
    );
  }, [activeTable?.items]);

  // Subtotal bruto incluyendo extras
  const rawTableGross = useMemo(() => {
    return effectiveTableItems.reduce((acc, item) => {
      const extrasSum = (item.extras || []).reduce((s, e) => s + e.price, 0);
      return acc + roundCurrency(item.quantity * (item.unitPrice + extrasSum));
    }, 0);
  }, [effectiveTableItems]);

  const computedGlobalDiscount = useMemo(() => {
    if (globalDiscountVal <= 0) return 0;
    if (globalDiscountType === 'PERCENT') {
      return roundCurrency(
        rawTableGross * (Math.min(100, globalDiscountVal) / 100)
      );
    }
    return Math.min(rawTableGross, roundCurrency(globalDiscountVal));
  }, [rawTableGross, globalDiscountType, globalDiscountVal]);

  const handleApplyPromoCode = () => {
    const clean = promoCodeInput.trim().toUpperCase();
    if (!clean) return;
    const found = promoCodes.find(
      (p) => p.code.toUpperCase() === clean && p.active
    );
    if (!found) {
      triggerToast(`El código "${clean}" no existe o está inactivo.`);
      return;
    }
    setGlobalDiscountType(found.type);
    setGlobalDiscountVal(found.value);
    setAppliedPromoCode(found.code);
    triggerToast(`Cupón ${found.code} aplicado (${found.description}).`);
  };

  // Totales de la mesa completa (soporta cobro CON impuestos o SIN impuestos)
  const tableTotals = useMemo(() => {
    return calculateInvoiceTotals(effectiveTableItems, {
      isFiscal: !exemptItbisOnTable,
      includeLegalTip: activeTable?.includeLegalTip ?? true,
      depositPercentage: 100,
      globalDiscount: computedGlobalDiscount,
    });
  }, [
    effectiveTableItems,
    exemptItbisOnTable,
    activeTable?.includeLegalTip,
    computedGlobalDiscount,
  ]);

  // Cantidad de ítems nuevos pendientes de enviar a Cocina/Bar
  const pendingUnsentCount = useMemo(() => {
    if (!activeTable) return 0;
    return activeTable.items.reduce(
      (acc, i) => acc + Math.max(0, i.quantity - (i.sentQuantity || 0)),
      0
    );
  }, [activeTable]);

  // Ítems seleccionados en modo Split por Plato
  const splitSelectedItems = useMemo(() => {
    return effectiveTableItems.filter((i) =>
      selectedSplitItemIds.includes(i.id)
    );
  }, [effectiveTableItems, selectedSplitItemIds]);

  // Ítems efectivos a facturar según el modo de checkout elegido
  const activeCheckoutItems: InvoiceItem[] = useMemo(() => {
    if (!activeTable) return [];
    if (checkoutType === 'SELECTED_ITEMS') {
      return splitSelectedItems;
    }
    if (checkoutType === 'PART_SHARE') {
      const divisor = Math.max(2, splitCount);
      return effectiveTableItems.map((i) => {
        const extrasSum = (i.extras || []).reduce((s, e) => s + e.price, 0);
        return {
          ...i,
          extras: [],
          description: `${i.description} (Parte 1/${divisor})`,
          unitPrice: roundCurrency((i.unitPrice + extrasSum) / divisor),
          discount: roundCurrency((i.discount || 0) / divisor),
        };
      });
    }
    return effectiveTableItems;
  }, [
    activeTable,
    checkoutType,
    splitSelectedItems,
    splitCount,
    effectiveTableItems,
  ]);

  const checkoutTotals = useMemo(() => {
    const shareDiscount =
      checkoutType === 'PART_SHARE'
        ? roundCurrency(computedGlobalDiscount / Math.max(2, splitCount))
        : checkoutType === 'SELECTED_ITEMS'
        ? 0
        : computedGlobalDiscount;

    return calculateInvoiceTotals(activeCheckoutItems, {
      isFiscal: isFiscal && !exemptItbisOnTable,
      includeLegalTip: activeTable?.includeLegalTip ?? true,
      depositPercentage: 100,
      globalDiscount: shareDiscount,
      forceZeroTaxes: !isFiscal || exemptItbisOnTable,
    });
  }, [
    activeCheckoutItems,
    isFiscal,
    exemptItbisOnTable,
    activeTable?.includeLegalTip,
    computedGlobalDiscount,
    checkoutType,
    splitCount,
  ]);

  // Abrir mesa libre (Si el operador activo es CAMARERO, asigna automáticamente su nombre)
  const handleOpenTable = async (table: RestaurantTableAccount) => {
    const autoWaiter =
      currentUser.role === 'CAMARERO'
        ? currentUser.name
        : table.waiterName || currentUser.name;

    await db.restaurantTables.update(table.id, {
      status: 'OCUPADA',
      guests: table.guests > 0 ? table.guests : 2,
      waiterName: autoWaiter,
      orderType: table.orderType || 'SALON',
      openedAt: new Date().toISOString(),
    });
    await logAuditAction({
      user: currentUser,
      brandId: activeBrand.id,
      action: 'ABRIR_MESA',
      details: `${table.name} (${table.zone}) abierta por ${autoWaiter}`,
    });
    setSelectedTableId(table.id);
    setSelectedSplitItemIds([]);
  };

  // Crear nueva mesa en el mapa
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    const newId = `mesa-${Date.now()}`;
    await db.restaurantTables.put({
      id: newId,
      name: newTableName.trim(),
      zone: newTableZone,
      capacity: Math.max(1, Number(newTableCapacity) || 4),
      status: 'LIBRE',
      guests: 2,
      waiterName: currentUser.name,
      clientName: 'Consumidor Final',
      clientRncOrCedula: '',
      includeLegalTip: true,
      orderType: 'SALON',
      splitWays: 1,
      items: [],
    });
    await logAuditAction({
      user: currentUser,
      brandId: activeBrand.id,
      action: 'CREAR_MESA',
      details: `Mesa "${newTableName.trim()}" creada en zona ${newTableZone}`,
    });
    setNewTableName('');
    setShowNewTableModal(false);
    setSelectedTableId(newId);
  };

  // Eliminar mesa permanentemente (Solo ADMIN)
  const handleDeleteTable = async () => {
    if (!activeTable || !isAdmin) return;
    const deletedName = activeTable.name;
    const remaining = tables.filter((t) => t.id !== activeTable.id);
    await db.restaurantTables.delete(activeTable.id);
    await logAuditAction({
      user: currentUser,
      brandId: activeBrand.id,
      action: 'ELIMINAR_MESA',
      details: `Mesa "${deletedName}" eliminada del mapa por ${currentUser.name}`,
    });
    setConfirmDeleteTableModal(false);
    if (remaining[0]) {
      setSelectedTableId(remaining[0].id);
    }
    triggerToast(`Mesa "${deletedName}" eliminada.`);
  };

  const handleUpdateTableMeta = async (
    patch: Partial<RestaurantTableAccount>
  ) => {
    if (!activeTable) return;
    await db.restaurantTables.update(activeTable.id, patch);
  };

  // Botón rápido: Sin Impuestos ni Propina (0% ITBIS y 0% Propina)
  const handleToggleZeroTaxesQuick = async () => {
    if (!activeTable) return;
    const nextExempt = !exemptItbisOnTable;
    setExemptItbisOnTable(nextExempt);
    if (nextExempt) {
      await db.restaurantTables.update(activeTable.id, {
        includeLegalTip: false,
      });
      triggerToast('Modo Sin Impuestos activado (0% ITBIS / 0% Propina).');
    } else {
      await db.restaurantTables.update(activeTable.id, {
        includeLegalTip: (activeTable.orderType || 'SALON') === 'SALON',
      });
      triggerToast('Cálculo de ITBIS (18%) y Propina (10%) activado.');
    }
  };

  // Cambiar modalidad de pedido (Salón vs Para Llevar / Delivery)
  const handleChangeOrderType = async (newType: RestaurantOrderType) => {
    if (!activeTable) return;
    const shouldIncludeTip = newType === 'SALON' && !exemptItbisOnTable;
    await db.restaurantTables.update(activeTable.id, {
      orderType: newType,
      includeLegalTip: shouldIncludeTip,
    });
  };

  // Agregar plato a la mesa activa
  const handleAddDishToTable = async (dish: CatalogItem) => {
    if (!activeTable) return;

    const currentItems = [...activeTable.items];
    const station = inferStation(dish);
    const course = inferCourse(dish);

    const existingIdx = currentItems.findIndex(
      (i) =>
        i.code === dish.code &&
        (!i.notes || i.notes.trim() === '') &&
        (!i.extras || i.extras.length === 0) &&
        !i.isCourtesy
    );

    if (existingIdx >= 0) {
      currentItems[existingIdx] = {
        ...currentItems[existingIdx],
        quantity: currentItems[existingIdx].quantity + 1,
        station: currentItems[existingIdx].station || station,
        course: currentItems[existingIdx].course || course,
      };
    } else {
      currentItems.push({
        id: `${dish.code}-${Date.now()}`,
        code: dish.code,
        description: dish.name,
        quantity: 1,
        sentQuantity: 0,
        station,
        course,
        unit: dish.unit || 'UND',
        unitPrice: dish.price,
        discount: 0,
        notes: '',
        extras: [],
      });
    }

    const autoWaiter =
      activeTable.status === 'LIBRE' && currentUser.role === 'CAMARERO'
        ? currentUser.name
        : activeTable.waiterName || currentUser.name;

    await db.restaurantTables.update(activeTable.id, {
      status: activeTable.status === 'LIBRE' ? 'OCUPADA' : activeTable.status,
      waiterName: autoWaiter,
      openedAt: activeTable.openedAt || new Date().toISOString(),
      orderType: activeTable.orderType || 'SALON',
      items: currentItems,
    });
  };

  const handleUpdateDishQty = async (itemId: string, delta: number) => {
    if (!activeTable) return;
    const updated = activeTable.items
      .map((item) => {
        if (item.id !== itemId) return item;
        const nextQty = item.quantity + delta;
        return {
          ...item,
          quantity: nextQty,
          sentQuantity: Math.min(item.sentQuantity || 0, Math.max(0, nextQty)),
        };
      })
      .filter((item) => item.quantity > 0);

    await db.restaurantTables.update(activeTable.id, { items: updated });
    setSelectedSplitItemIds((prev) =>
      prev.filter((id) => updated.some((u) => u.id === id))
    );
  };

  const handleUpdateDishField = async (
    itemId: string,
    patch: Partial<InvoiceItem>
  ) => {
    if (!activeTable) return;
    const updated = activeTable.items.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item
    );
    await db.restaurantTables.update(activeTable.id, { items: updated });
  };

  // Agregar Extra con precio a un plato
  const handleAddExtraToDish = async (
    itemId: string,
    extraName: string,
    extraPrice: number
  ) => {
    if (!activeTable || !extraName.trim()) return;
    const newExtra: InvoiceItemExtra = {
      id: `ext-${Date.now()}-${Math.random()}`,
      name: extraName.trim(),
      price: Math.max(0, Number(extraPrice) || 0),
    };
    const updated = activeTable.items.map((item) =>
      item.id === itemId
        ? { ...item, extras: [...(item.extras || []), newExtra] }
        : item
    );
    await db.restaurantTables.update(activeTable.id, { items: updated });
  };

  const handleRemoveExtraFromDish = async (itemId: string, extraId: string) => {
    if (!activeTable) return;
    const updated = activeTable.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            extras: (item.extras || []).filter((ex) => ex.id !== extraId),
          }
        : item
    );
    await db.restaurantTables.update(activeTable.id, { items: updated });
  };

  const handleRemoveDish = async (itemId: string) => {
    if (!activeTable) return;
    const updated = activeTable.items.filter((item) => item.id !== itemId);
    await db.restaurantTables.update(activeTable.id, { items: updated });
    setSelectedSplitItemIds((prev) => prev.filter((id) => id !== itemId));
  };

  // ==========================================
  // FLUJO DIRECTO DE COMANDA (COCINA vs BAR) SIN PRECIOS
  // ==========================================
  const handleSendKitchenCommand = async (
    targetStation: 'ALL' | 'COCINA' | 'BAR'
  ) => {
    if (!activeTable || activeTable.items.length === 0) return;

    const hasNewItems = activeTable.items.some(
      (i) => i.quantity > (i.sentQuantity || 0)
    );

    const itemsForCommand: InvoiceItem[] = activeTable.items
      .map((item) => {
        const st = item.station || 'COCINA';
        const diffQty = hasNewItems
          ? Math.max(0, item.quantity - (item.sentQuantity || 0))
          : item.quantity;
        return {
          ...item,
          station: st,
          quantity: diffQty,
        };
      })
      .filter((item) => {
        if (item.quantity <= 0) return false;
        if (targetStation === 'ALL') return true;
        return item.station === targetStation;
      });

    if (itemsForCommand.length === 0) {
      const fallbackStationItems = activeTable.items.filter(
        (i) =>
          targetStation === 'ALL' || (i.station || 'COCINA') === targetStation
      );
      if (fallbackStationItems.length === 0) {
        triggerToast(
          `No hay ítems de ${
            targetStation === 'BAR' ? 'Bar / Bebidas' : 'Cocina'
          } en esta mesa.`
        );
        return;
      }
      itemsForCommand.push(...fallbackStationItems);
    }

    const cocinaItems = itemsForCommand.filter(
      (i) => (i.station || 'COCINA') === 'COCINA'
    );
    const barItems = itemsForCommand.filter((i) => i.station === 'BAR');

    const nowIso = new Date().toISOString();
    const orderNumber = `${activeTable.name.replace(/\s+/g, '')}-${new Date().getMinutes()}${new Date().getSeconds()}`;

    const tickets: KitchenTicketBlock[] = [];
    if (cocinaItems.length > 0) {
      tickets.push({
        station: 'COCINA',
        tableName: activeTable.name,
        zone: activeTable.zone,
        waiterName: activeTable.waiterName || currentUser.name,
        guests: activeTable.guests || 1,
        orderNumber,
        orderType: activeTable.orderType || 'SALON',
        createdAt: nowIso,
        items: cocinaItems,
      });
    }
    if (barItems.length > 0) {
      tickets.push({
        station: 'BAR',
        tableName: activeTable.name,
        zone: activeTable.zone,
        waiterName: activeTable.waiterName || currentUser.name,
        guests: activeTable.guests || 1,
        orderNumber,
        orderType: activeTable.orderType || 'SALON',
        createdAt: nowIso,
        items: barItems,
      });
    }

    const updatedTableItems = activeTable.items.map((item) => {
      const st = item.station || 'COCINA';
      if (targetStation === 'ALL' || st === targetStation) {
        return { ...item, sentQuantity: item.quantity };
      }
      return item;
    });

    await db.restaurantTables.update(activeTable.id, {
      status: activeTable.status === 'LIBRE' ? 'OCUPADA' : activeTable.status,
      items: updatedTableItems,
    });

    await logAuditAction({
      user: currentUser,
      brandId: activeBrand.id,
      action: 'COMANDA_COCINA_BAR',
      details: `Comanda enviada en ${activeTable.name} (${itemsForCommand.length} líneas)`,
    });

    setPrintDoc({
      isFiscal: false,
      isKitchenOrder: true,
      autoPrint: true,
      kitchenTickets: tickets,
      brand: activeBrand,
      corporate,
      documentCode: `CMD-${orderNumber}`,
      defaultFormat: 'THERMAL_80MM',
      clientName: activeTable.name,
      createdAt: nowIso,
      items: itemsForCommand,
      subtotal: 0,
      itbisAmount: 0,
      totalAmount: 0,
      amountPaid: 0,
      balanceDue: 0,
    });
  };

  // ==========================================
  // TRANSFERIR / CAMBIAR DE MESA O UNIR MESAS
  // ==========================================
  const handleMoveOrMergeTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTable || !targetTableId || targetTableId === activeTable.id) {
      return;
    }

    const destTable = tables.find((t) => t.id === targetTableId);
    if (!destTable) return;

    if (destTable.status === 'LIBRE' || destTable.items.length === 0) {
      await db.restaurantTables.update(destTable.id, {
        status: activeTable.status === 'LIBRE' ? 'OCUPADA' : activeTable.status,
        guests: activeTable.guests,
        waiterName: activeTable.waiterName,
        clientName: activeTable.clientName,
        clientRncOrCedula: activeTable.clientRncOrCedula,
        includeLegalTip: activeTable.includeLegalTip,
        orderType: activeTable.orderType || 'SALON',
        openedAt: activeTable.openedAt || new Date().toISOString(),
        items: activeTable.items,
      });
      await logAuditAction({
        user: currentUser,
        brandId: activeBrand.id,
        action: 'TRANSFERIR_MESA',
        details: `Cuenta transferida de ${activeTable.name} a ${destTable.name}`,
      });
      triggerToast(
        `Cuenta transferida de ${activeTable.name} a ${destTable.name}.`
      );
    } else {
      const mergedItems = [...destTable.items, ...activeTable.items];
      await db.restaurantTables.update(destTable.id, {
        status: 'OCUPADA',
        guests: (destTable.guests || 1) + (activeTable.guests || 1),
        items: mergedItems,
      });
      await logAuditAction({
        user: currentUser,
        brandId: activeBrand.id,
        action: 'UNIR_MESAS',
        details: `${activeTable.name} unida con ${destTable.name}`,
      });
      triggerToast(
        `${activeTable.name} unida con ${destTable.name} (${mergedItems.length} líneas).`
      );
    }

    await db.restaurantTables.update(activeTable.id, {
      status: 'LIBRE',
      guests: 2,
      openedAt: undefined,
      orderType: 'SALON',
      includeLegalTip: true,
      items: [],
      clientName: 'Consumidor Final',
      clientRncOrCedula: '',
    });

    setShowMoveMergeModal(false);
    setSelectedTableId(destTable.id);
    setSelectedSplitItemIds([]);
  };

  // Emitir Pre-Cuenta
  const handlePreCuenta = async () => {
    if (!activeTable || activeTable.items.length === 0) return;

    await db.restaurantTables.update(activeTable.id, {
      status: 'PRE_CUENTA',
    });

    const ways = splitMode === 'PARTS' ? Math.max(2, splitCount) : 1;
    const voluntaryTipNum = Math.max(0, roundCurrency(Number(voluntaryTipInput) || 0));
    const perPerson = roundCurrency(
      (tableTotals.totalAmount + voluntaryTipNum) / ways
    );

    setPrintDoc({
      isFiscal: false,
      brand: activeBrand,
      corporate,
      documentCode: `PRE-${activeTable.name.replace(/\s+/g, '')}`,
      customTitle: `PRE-CUENTA • ${activeTable.name.toUpperCase()}`,
      defaultFormat: 'THERMAL_80MM',
      clientName:
        activeTable.clientName || `${activeTable.name} (${activeTable.zone})`,
      clientRncOrCedula: activeTable.clientRncOrCedula,
      createdAt: new Date().toISOString(),
      items: activeTable.items,
      subtotal: tableTotals.netSubtotal,
      discountTotal: tableTotals.discountTotal,
      promoCodeApplied: appliedPromoCode || undefined,
      itbisAmount: tableTotals.itbisAmount,
      legalTipAmount: tableTotals.legalTipAmount,
      voluntaryTipAmount: voluntaryTipNum > 0 ? voluntaryTipNum : undefined,
      totalAmount: tableTotals.totalAmount,
      amountPaid: 0,
      balanceDue: 0,
      notes:
        ways > 1
          ? `Dividida entre ${ways} personas: ${formatMoney(perPerson)} c/u`
          : `Mesero: ${activeTable.waiterName || 'Salón'} • Comensales: ${
              activeTable.guests || 1
            }`,
    });
  };

  const openCheckoutWithMode = (
    mode: 'FULL' | 'PART_SHARE' | 'SELECTED_ITEMS'
  ) => {
    setErrorMsg(null);
    setCheckoutType(mode);
    setIsFiscal(!exemptItbisOnTable);
    if (activeTable) {
      setCustomCustomerName(
        activeTable.clientName && !activeTable.clientName.startsWith('Mesa')
          ? activeTable.clientName
          : 'Consumidor Final'
      );
      setCustomCustomerRnc(activeTable.clientRncOrCedula || '');
    }
    setShowCheckoutModal(true);
  };

  const handleCloseTableAndPay = async () => {
    if (!activeTable || activeCheckoutItems.length === 0) return;
    setErrorMsg(null);

    const cleanRnc = customCustomerRnc.replace(/\D/g, '');
    if (
      isFiscal &&
      ncfType === 'B01' &&
      cleanRnc.length !== 9 &&
      cleanRnc.length !== 11
    ) {
      setErrorMsg(
        'Para Crédito Fiscal (B01) debe ingresar un RNC (9 dígitos) o Cédula (11 dígitos) válido.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const shareDiscount =
        checkoutType === 'PART_SHARE'
          ? roundCurrency(computedGlobalDiscount / Math.max(2, splitCount))
          : checkoutType === 'SELECTED_ITEMS'
          ? 0
          : computedGlobalDiscount;

      const voluntaryTipNum = Math.max(
        0,
        roundCurrency(Number(voluntaryTipInput) || 0)
      );

      const issued = await issueDocumentTransaction({
        brandId: activeBrand.id,
        moduleUsed: 'RESTAURANT_MODULE',
        isFiscal,
        ncfType: isFiscal ? ncfType : undefined,
        internalDocTitle: 'RECIBO_DE_PAGO',
        customerName: customCustomerName.trim() || 'Consumidor Final',
        customerRncOrCedula: isFiscal ? cleanRnc : undefined,
        customerPhone: customCustomerPhone.trim() || undefined,
        paymentMethod,
        items: activeCheckoutItems,
        includeLegalTip: activeTable.includeLegalTip,
        voluntaryTipAmount: voluntaryTipNum > 0 ? voluntaryTipNum : undefined,
        depositPercentage: 100,
        globalDiscount: shareDiscount,
        forceZeroTaxes: !isFiscal || exemptItbisOnTable,
      });

      await logAuditAction({
        user: currentUser,
        brandId: activeBrand.id,
        action: 'COBRO_RESTAURANTE',
        details: `${activeTable.name} • ${issued.documentCode} • Total RD$ ${issued.totalAmount}${
          voluntaryTipNum > 0
            ? ` (+Propina Extra Mesero RD$ ${voluntaryTipNum})`
            : ''
        } (Mesero: ${activeTable.waiterName})`,
      });

      if (checkoutType === 'SELECTED_ITEMS') {
        const remainingItems = activeTable.items.filter(
          (i) => !selectedSplitItemIds.includes(i.id)
        );
        if (remainingItems.length > 0) {
          await db.restaurantTables.update(activeTable.id, {
            status: 'OCUPADA',
            items: remainingItems,
          });
        } else {
          await db.restaurantTables.update(activeTable.id, {
            status: 'LIBRE',
            guests: 2,
            openedAt: undefined,
            orderType: 'SALON',
            includeLegalTip: true,
            items: [],
          });
        }
        setSelectedSplitItemIds([]);
      } else if (checkoutType === 'PART_SHARE') {
        await db.restaurantTables.update(activeTable.id, {
          status: 'PRE_CUENTA',
        });
      } else {
        await db.restaurantTables.update(activeTable.id, {
          status: 'LIBRE',
          guests: 2,
          openedAt: undefined,
          orderType: 'SALON',
          includeLegalTip: true,
          items: [],
          clientName: 'Consumidor Final',
          clientRncOrCedula: '',
        });
        setPromoCodeInput('');
        setAppliedPromoCode('');
        setGlobalDiscountVal(0);
      }

      setVoluntaryTipInput('');
      setShowCheckoutModal(false);

      const seqUsed = isFiscal
        ? ncfSequences.find((s) => s.type === ncfType)
        : undefined;

      setPrintDoc({
        isFiscal: issued.isFiscal,
        brand: activeBrand,
        corporate,
        ncfSequence: seqUsed,
        documentCode: issued.documentCode,
        internalDocTitle: 'RECIBO_DE_PAGO',
        authorizationNo: issued.authorizationNo,
        expirationDate: issued.expirationDate,
        clientName: issued.customerName,
        clientRncOrCedula: issued.customerRncOrCedula,
        clientPhone: customCustomerPhone,
        createdAt: issued.createdAt,
        items: issued.items,
        subtotal: issued.subtotal,
        discountTotal: issued.discountTotal,
        promoCodeApplied: appliedPromoCode || undefined,
        itbisAmount: issued.itbisAmount,
        legalTipAmount: issued.legalTipAmount,
        voluntaryTipAmount: issued.voluntaryTipAmount,
        totalAmount: issued.totalAmount,
        amountPaid: issued.amountPaid,
        balanceDue: 0,
        notes: `${activeTable.name} (${activeTable.zone}) • Mesero: ${activeTable.waiterName} • Pago: ${paymentMethod}`,
      });
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error al facturar la cuenta de la mesa.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkTableFree = async () => {
    if (!activeTable) return;
    await db.restaurantTables.update(activeTable.id, {
      status: 'LIBRE',
      guests: 2,
      openedAt: undefined,
      orderType: 'SALON',
      includeLegalTip: true,
      items: [],
      clientName: 'Consumidor Final',
      clientRncOrCedula: '',
    });
    await logAuditAction({
      user: currentUser,
      brandId: activeBrand.id,
      action: 'LIBERAR_MESA',
      details: `${activeTable.name} liberada/vaciada por ${currentUser.name}`,
    });
    setSelectedSplitItemIds([]);
    setConfirmClearModal(false);
    triggerToast(`${activeTable.name} liberada correctamente.`);
  };

  const occupiedCount = tables.filter((t) => t.status !== 'LIBRE').length;
  const freeCount = tables.filter((t) => t.status === 'LIBRE').length;

  return (
    <div className="space-y-6">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* Encabezado Superior de Restaurante */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Restaurante, Mesas & Comandas (Cocina / Bar)
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <Utensils className="w-3 h-3" />
              Operador: {currentUser.name} ({currentUser.role})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Comandas separadas por estación (Cocina vs. Bar) sin precios, extras por plato, cobro con o sin impuestos y cupones
          </p>
        </div>

        {/* Selector de Zonas + Nueva Mesa */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/80 shadow-xs">
            {(['ALL', 'SALON', 'TERRAZA', 'VIP', 'EVENTOS'] as const).map(
              (zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => setSelectedZone(zone)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    selectedZone === zone
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {zone === 'ALL' ? 'Todas' : zone}
                </button>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowNewTableModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-orange-600" />
            Nueva Mesa
          </button>
        </div>
      </div>

      {/* PESTAÑAS SUPERIORES RÁPIDAS EN MÓVIL (< 1024px) PARA CAMAREROS */}
      <div className="lg:hidden grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-200/80 border border-slate-200">
        <button
          type="button"
          onClick={() => setMobileSectionTab('TABLES')}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
            mobileSectionTab === 'TABLES'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          🗺️ Mesas ({tables.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileSectionTab('MENU')}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
            mobileSectionTab === 'MENU'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          🍔 Menú
        </button>
        <button
          type="button"
          onClick={() => setMobileSectionTab('BILL')}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
            mobileSectionTab === 'BILL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          🧾 Cuenta (
          {activeTable
            ? activeTable.items.reduce((a, b) => a + b.quantity, 0)
            : 0}
          )
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA (7 COLS): MAPA DE MESAS + MENÚ RÁPIDO */}
        <div
          className={`lg:col-span-7 space-y-6 ${
            mobileSectionTab === 'BILL' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div
            className={`bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs ${
              mobileSectionTab === 'TABLES' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Mapa de Mesas ({selectedZone === 'ALL' ? 'General' : selectedZone})
              </h2>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  Libres: {freeCount}
                </span>
                <span className="flex items-center gap-1.5 text-amber-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Ocupadas / Pre-Cuenta: {occupiedCount}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {filteredTables.map((table) => {
                const isSelected = table.id === activeTable?.id;
                const effItems = table.items.map((i) =>
                  i.isCourtesy
                    ? { ...i, unitPrice: 0, discount: 0, extras: [] }
                    : i
                );
                const tableCalc = calculateInvoiceTotals(effItems, {
                  isFiscal: !exemptItbisOnTable,
                  includeLegalTip: table.includeLegalTip,
                });

                const elapsedMinutes =
                  table.status !== 'LIBRE' && table.openedAt
                    ? Math.max(
                        1,
                        Math.floor(
                          (nowTick - new Date(table.openedAt).getTime()) / 60000
                        )
                      )
                    : 0;

                const hasUnsent = table.items.some(
                  (i) => i.quantity > (i.sentQuantity || 0)
                );

                const statusStyles =
                  table.status === 'LIBRE'
                    ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-400 text-emerald-950'
                    : table.status === 'OCUPADA'
                      ? 'bg-amber-50/80 border-amber-300 hover:border-amber-500 text-amber-950'
                      : 'bg-purple-50/80 border-purple-300 hover:border-purple-500 text-purple-950';

                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => {
                      setSelectedTableId(table.id);
                      setSelectedSplitItemIds([]);
                    }}
                    className={`relative p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[128px] ${statusStyles} ${
                      isSelected ? 'ring-2 ring-slate-900 shadow-md scale-[1.01]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 block">
                          {table.zone}
                        </span>
                        <h3 className="text-sm font-bold">{table.name}</h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          table.status === 'LIBRE'
                            ? 'bg-emerald-200/70 text-emerald-900'
                            : table.status === 'OCUPADA'
                              ? 'bg-amber-200/80 text-amber-900'
                              : 'bg-purple-200/80 text-purple-900'
                        }`}
                      >
                        {table.status === 'PRE_CUENTA' ? 'PRE-CTA' : table.status}
                      </span>
                    </div>

                    {table.status !== 'LIBRE' && (
                      <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                            elapsedMinutes >= 45
                              ? 'bg-rose-200/80 text-rose-900 font-bold'
                              : 'bg-black/5 text-slate-700'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {elapsedMinutes} min
                        </span>
                        {hasUnsent && (
                          <span className="px-1.5 py-0.5 rounded bg-orange-500 text-white font-bold animate-pulse">
                            Por comandar
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-2.5 pt-2 border-t border-black/10 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 font-medium opacity-80">
                        <Users className="w-3.5 h-3.5" />
                        {table.status === 'LIBRE'
                          ? `${table.capacity} máx`
                          : `${table.guests} pers.`}
                      </span>
                      {table.status !== 'LIBRE' && (
                        <span className="font-mono font-bold text-xs">
                          {formatMoney(tableCalc.totalAmount)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menú Rápido de Platos con Buscador y Categorías */}
          <div
            className={`bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs ${
              mobileSectionTab === 'MENU' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Menú Rápido • Platos (Cocina) & Bebidas (Bar)
                </h2>
                <p className="text-xs text-slate-400">
                  {activeTable
                    ? `Clic en un plato o bebida para agregar a ${activeTable.name}`
                    : 'Selecciona una mesa arriba'}
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Buscar plato, código o bebida..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
              {menuCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'ALL' ? 'Todos' : cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredMenuItems.map((dish) => {
                const st = inferStation(dish);
                return (
                  <button
                    key={dish.id || dish.code}
                    type="button"
                    disabled={!activeTable}
                    onClick={() => handleAddDishToTable(dish)}
                    className="p-3 rounded-xl border border-slate-200/90 hover:border-slate-900 bg-slate-50/50 hover:bg-white text-left transition-all flex items-center justify-between gap-3 disabled:opacity-40 group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {dish.category}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            st === 'BAR'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {st}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-orange-600 transition-colors mt-0.5">
                        {dish.name}
                      </h4>
                      <span className="text-xs font-mono font-bold text-slate-700">
                        {formatMoney(dish.price)}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors shrink-0">
                      <Plus className="w-4 h-4" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA (5 COLS): COMANDA DE MESA, FLUJO BAR/COCINA, EXTRAS Y COBRO */}
        <div
          className={`lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden sticky top-20 ${
            mobileSectionTab === 'BILL' ? 'block' : 'hidden lg:block'
          }`}
        >
          {!activeTable ? (
            <div className="p-12 text-center">
              <Utensils className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">
                Ninguna mesa seleccionada
              </p>
            </div>
          ) : (
            <>
              {/* Encabezado de Mesa Activa */}
              <div className="p-4 bg-slate-900 text-white space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold">{activeTable.name}</h2>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/15 text-white">
                        {activeTable.zone}
                      </span>
                    </div>
                    {activeTable.openedAt && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          Abierta:{' '}
                          {new Date(activeTable.openedAt).toLocaleTimeString(
                            'es-DO',
                            { hour: '2-digit', minute: '2-digit' }
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {activeTable.status === 'LIBRE' ? (
                      <button
                        type="button"
                        onClick={() => handleOpenTable(activeTable)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors"
                      >
                        Abrir Mesa
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const other = tables.find(
                              (t) => t.id !== activeTable.id
                            );
                            setTargetTableId(other?.id || '');
                            setShowMoveMergeModal(true);
                          }}
                          title="Cambiar de mesa o unir con otra mesa"
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
                          <span>Cambiar/Unir</span>
                        </button>

                        <button
                          type="button"
                          onClick={handlePreCuenta}
                          disabled={activeTable.items.length === 0}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-40"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Pre-Cuenta</span>
                        </button>
                      </>
                    )}

                    {/* Botón Eliminar Mesa (Solo ADMIN) */}
                    {isAdmin && tables.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTableModal(true)}
                        title="Eliminar Mesa del Mapa (Solo Admin)"
                        className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Selector de Modalidad de Pedido: En Salón vs Para Llevar vs Delivery */}
                {activeTable.status !== 'LIBRE' && (
                  <div className="grid grid-cols-3 gap-1 bg-white/10 p-1 rounded-xl text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => handleChangeOrderType('SALON')}
                      className={`py-1 rounded-lg flex items-center justify-center gap-1 transition-all ${
                        (activeTable.orderType || 'SALON') === 'SALON'
                          ? 'bg-white text-slate-900 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Utensils className="w-3 h-3" />
                      <span>En Salón</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeOrderType('PARA_LLEVAR')}
                      className={`py-1 rounded-lg flex items-center justify-center gap-1 transition-all ${
                        activeTable.orderType === 'PARA_LLEVAR'
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <ShoppingBag className="w-3 h-3" />
                      <span>Para Llevar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChangeOrderType('DELIVERY')}
                      className={`py-1 rounded-lg flex items-center justify-center gap-1 transition-all ${
                        activeTable.orderType === 'DELIVERY'
                          ? 'bg-sky-400 text-slate-950 font-bold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <Truck className="w-3 h-3" />
                      <span>Delivery</span>
                    </button>
                  </div>
                )}

                {/* Barra de Envío Directo de Comandas (Cocina / Bar) sin precios */}
                {activeTable.status !== 'LIBRE' &&
                  activeTable.items.length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSendKitchenCommand('ALL')}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                          pendingUnsentCount > 0
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            : 'bg-white/15 hover:bg-white/25 text-white'
                        }`}
                      >
                        <ChefHat className="w-4 h-4" />
                        <span>
                          {pendingUnsentCount > 0
                            ? `Comandar Nuevos (${pendingUnsentCount})`
                            : 'Reimprimir Comanda'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendKitchenCommand('COCINA')}
                        title="Imprimir solo estación Cocina"
                        className="py-2 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                        <span>Cocina</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendKitchenCommand('BAR')}
                        title="Imprimir solo estación Bar / Bebidas"
                        className="py-2 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <Wine className="w-3.5 h-3.5 text-sky-400" />
                        <span>Bar</span>
                      </button>
                    </div>
                  )}

                {/* Edición rápida de Mesero y Comensales */}
                {activeTable.status !== 'LIBRE' && (
                  <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-[10px] text-slate-300">Mesero:</span>
                      <input
                        type="text"
                        value={activeTable.waiterName || ''}
                        onChange={(e) =>
                          handleUpdateTableMeta({ waiterName: e.target.value })
                        }
                        placeholder="Mesero"
                        className="bg-transparent text-white font-semibold text-xs focus:outline-none w-full"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-white/10 rounded-lg px-2.5 py-1">
                      <span className="text-[10px] text-slate-300 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-sky-400" />
                        PAX:
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateTableMeta({
                              guests: Math.max(1, (activeTable.guests || 1) - 1),
                            })
                          }
                          className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold px-1">
                          {activeTable.guests || 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateTableMeta({
                              guests: (activeTable.guests || 1) + 1,
                            })
                          }
                          className="w-5 h-5 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de Platos Ordenados con Estado de Comanda, Extras, Cortesía y Notas */}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {activeTable.items.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-xs font-medium text-slate-400">
                      La mesa no tiene platos registrados todavía.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Selecciona platos o bebidas del menú rápido para armar la comanda.
                    </p>
                  </div>
                ) : (
                  activeTable.items.map((item) => {
                    const isCheckedForSplit = selectedSplitItemIds.includes(
                      item.id
                    );
                    const isNoteOpen = expandedNoteItemId === item.id;
                    const sentQty = item.sentQuantity || 0;
                    const newQty = Math.max(0, item.quantity - sentQty);
                    const st = item.station || 'COCINA';
                    const extrasUnitSum = (item.extras || []).reduce(
                      (s, e) => s + e.price,
                      0
                    );
                    const effectiveUnit = item.unitPrice + extrasUnitSum;

                    return (
                      <div
                        key={item.id}
                        className="p-3 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            {splitMode === 'ITEMS' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSplitItemIds((prev) =>
                                    prev.includes(item.id)
                                      ? prev.filter((id) => id !== item.id)
                                      : [...prev, item.id]
                                  )
                                }
                                className="mt-0.5 text-slate-700 hover:text-slate-900"
                              >
                                {isCheckedForSplit ? (
                                  <CheckSquare className="w-4 h-4 text-orange-600" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                                    st === 'BAR'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {st}
                                </span>
                                <p className="text-xs font-semibold text-slate-900 truncate">
                                  {item.description}
                                </p>
                              </div>

                              {/* Extras ya agregados a este plato */}
                              {item.extras && item.extras.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.extras.map((ex) => (
                                    <span
                                      key={ex.id}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-mono font-bold"
                                    >
                                      <span>
                                        +{ex.name} (RD$ {ex.price})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveExtraFromDish(
                                            item.id,
                                            ex.id
                                          )
                                        }
                                        className="hover:text-rose-600"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                <span className="text-[11px] text-slate-500 font-mono">
                                  {item.isCourtesy
                                    ? 'CORTESÍA (RD$ 0)'
                                    : `${formatMoney(effectiveUnit)} c/u`}
                                </span>

                                {sentQty > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    En {st === 'BAR' ? 'Bar' : 'Cocina'} ({sentQty})
                                  </span>
                                )}

                                {newQty > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-orange-800 border border-orange-300">
                                    Nuevo ({newQty})
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedNoteItemId(
                                      isNoteOpen ? null : item.id
                                    )
                                  }
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                    item.notes ||
                                    (item.extras && item.extras.length > 0)
                                      ? 'bg-amber-100 text-amber-900'
                                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                                  }`}
                                >
                                  <PlusCircle className="w-3 h-3" />
                                  <span>
                                    {item.notes ? item.notes : '+ Extra / Nota'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateDishQty(item.id, -1)}
                              className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-bold font-mono">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateDishQty(item.id, 1)}
                              className="w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="text-right min-w-[74px]">
                            <p className="text-xs font-bold font-mono text-slate-900">
                              {item.isCourtesy
                                ? 'RD$ 0.00'
                                : formatMoney(item.quantity * effectiveUnit)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveDish(item.id)}
                            className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Editor desplegable de Extras con Precio, Nota de Cocina, Tiempo y Cortesía */}
                        {isNoteOpen && (
                          <div className="mt-2 pt-2 border-t border-slate-100 space-y-2.5 bg-slate-50/70 p-2 rounded-xl">
                            {/* SECCIÓN EXTRAS CON PRECIO */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold uppercase text-teal-800 block">
                                Agregar Extra con Cargo al Plato:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {EXTRA_PRESETS.map((ex) => (
                                  <button
                                    key={ex.name}
                                    type="button"
                                    onClick={() =>
                                      handleAddExtraToDish(
                                        item.id,
                                        ex.name,
                                        ex.price
                                      )
                                    }
                                    className="px-2 py-0.5 rounded bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 text-[10px] font-semibold font-mono"
                                  >
                                    + {ex.name} (RD$ {ex.price})
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-center gap-1.5 pt-0.5">
                                <input
                                  type="text"
                                  placeholder="Otro extra (ej. Camarones)"
                                  value={customExtraName}
                                  onChange={(e) =>
                                    setCustomExtraName(e.target.value)
                                  }
                                  className="flex-1 px-2 py-1 rounded border border-slate-200 bg-white text-[11px]"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="RD$"
                                  value={customExtraPrice}
                                  onChange={(e) =>
                                    setCustomExtraPrice(e.target.value)
                                  }
                                  className="w-20 px-2 py-1 rounded border border-slate-200 bg-white text-[11px] font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!customExtraName.trim()) return;
                                    handleAddExtraToDish(
                                      item.id,
                                      customExtraName,
                                      Number(customExtraPrice) || 0
                                    );
                                    setCustomExtraName('');
                                    setCustomExtraPrice('');
                                  }}
                                  className="px-2.5 py-1 rounded bg-slate-900 text-white text-[10px] font-bold"
                                >
                                  + Extra
                                </button>
                              </div>
                            </div>

                            {/* TIEMPOS Y CORTESÍA */}
                            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/70">
                              <div className="flex items-center gap-1">
                                {(
                                  [
                                    { id: 'ENTRADA', label: '1er Tiempo' },
                                    { id: 'FUERTE', label: 'Fuerte' },
                                    { id: 'POSTRE', label: 'Postre' },
                                    { id: 'BEBIDA', label: 'Bebida' },
                                  ] as const
                                ).map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() =>
                                      handleUpdateDishField(item.id, {
                                        course: c.id,
                                      })
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                      item.course === c.id
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-600 border-slate-200'
                                    }`}
                                  >
                                    {c.label}
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateDishField(item.id, {
                                    isCourtesy: !item.isCourtesy,
                                  })
                                }
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  item.isCourtesy
                                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                <Gift className="w-3 h-3" />
                                <span>Cortesía</span>
                              </button>
                            </div>

                            {/* NOTAS DE PREPARACIÓN */}
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1">
                                {KITCHEN_PRESETS.map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                      const current = item.notes
                                        ? `${item.notes}, ${preset}`
                                        : preset;
                                      handleUpdateDishField(item.id, {
                                        notes: current,
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-semibold"
                                  >
                                    + {preset}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="text"
                                value={item.notes || ''}
                                onChange={(e) =>
                                  handleUpdateDishField(item.id, {
                                    notes: e.target.value,
                                  })
                                }
                                placeholder="Instrucción para cocina o bar..."
                                className="w-full px-2.5 py-1 rounded border border-slate-200 bg-white text-xs focus:outline-none focus:border-slate-900"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Split Bill Real: Completa, Partes Iguales (1/N) o Separar por Plato */}
              {activeTable.items.length > 0 && (
                <div className="p-3.5 bg-slate-50 border-t border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Split className="w-3.5 h-3.5 text-slate-600" />
                      Dividir Cuenta (Split Bill)
                    </span>
                    <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setSplitMode('FULL')}
                        className={`px-2 py-1 rounded-md transition-all ${
                          splitMode === 'FULL'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Completa
                      </button>
                      <button
                        type="button"
                        onClick={() => setSplitMode('PARTS')}
                        className={`px-2 py-1 rounded-md transition-all ${
                          splitMode === 'PARTS'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Partes Iguales
                      </button>
                      <button
                        type="button"
                        onClick={() => setSplitMode('ITEMS')}
                        className={`px-2 py-1 rounded-md transition-all ${
                          splitMode === 'ITEMS'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Por Plato
                      </button>
                    </div>
                  </div>

                  {splitMode === 'PARTS' && (
                    <div className="bg-white rounded-xl p-3 border border-slate-200/90 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600 font-medium">
                          Dividir entre comensales:
                        </span>
                        <div className="flex items-center gap-1.5">
                          {[2, 3, 4, 5, 6].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setSplitCount(n)}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                                splitCount === n
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            Cuota por persona (1/{splitCount}):
                          </span>
                          <span className="text-sm font-bold font-mono text-emerald-700">
                            {formatMoney(
                              roundCurrency(
                                tableTotals.totalAmount / Math.max(2, splitCount)
                              )
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCheckoutWithMode('PART_SHARE')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                        >
                          Facturar 1 Parte (1/{splitCount})
                        </button>
                      </div>
                    </div>
                  )}

                  {splitMode === 'ITEMS' && (
                    <div className="bg-white rounded-xl p-3 border border-slate-200/90 space-y-2">
                      <p className="text-[11px] text-slate-500">
                        Marca las casillas junto a los platos arriba para cobrarlos en una factura/NCF individual. La mesa seguirá ocupada con el resto.
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            Seleccionados ({splitSelectedItems.length} platos):
                          </span>
                          <span className="text-sm font-bold font-mono text-orange-600">
                            {formatMoney(
                              calculateInvoiceTotals(splitSelectedItems, {
                                isFiscal: !exemptItbisOnTable,
                                includeLegalTip: activeTable.includeLegalTip,
                              }).totalAmount
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={splitSelectedItems.length === 0}
                          onClick={() => openCheckoutWithMode('SELECTED_ITEMS')}
                          className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-colors disabled:opacity-40"
                        >
                          Cobrar Platos Seleccionados
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Totales de la Mesa + Modo Sin Impuestos + Descuento/Cupón */}
              <div className="p-4 bg-slate-50/70 border-t border-slate-200/80 space-y-2.5">
                {/* BARRA DE DESCUENTO Y CÓDIGO PROMOCIONAL */}
                {activeTable.items.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5 text-teal-600" />
                        <span>Descuento / Código</span>
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
                      {tableTotals.discountTotal > 0 && (
                        <span className="font-mono text-[11px] font-bold text-rose-600">
                          -{formatMoney(tableTotals.discountTotal)}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* BOTÓN RÁPIDO: COBRAR SIN IMPUESTOS NI PROPINA (NETO) */}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleToggleZeroTaxesQuick}
                    className={`w-full py-1.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      exemptItbisOnTable
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>
                      {exemptItbisOnTable
                        ? 'Modo Sin Impuestos Activo (0% ITBIS / 0% Propina)'
                        : 'Cobrar Sin Impuestos ni Propina (Precio Neto)'}
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Subtotal Platos + Extras:</span>
                  <span className="font-mono font-semibold">
                    {formatMoney(tableTotals.netSubtotal)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-amber-800 bg-amber-50/90 px-2.5 py-1.5 rounded-lg border border-amber-200/80">
                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={activeTable.includeLegalTip}
                      onChange={(e) =>
                        handleUpdateTableMeta({
                          includeLegalTip: e.target.checked,
                        })
                      }
                      className="rounded text-amber-600 focus:ring-0"
                    />
                    <span>10% Propina Legal (Ley 54-32):</span>
                  </label>
                  <span className="font-mono font-bold">
                    {formatMoney(tableTotals.legalTipAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!exemptItbisOnTable}
                      onChange={(e) => setExemptItbisOnTable(!e.target.checked)}
                      className="rounded text-slate-900"
                    />
                    <span>18% ITBIS:</span>
                  </label>
                  <span className="font-mono font-semibold">
                    {formatMoney(tableTotals.itbisAmount)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">
                    Total Cuenta Mesa:
                  </span>
                  <span className="text-lg font-extrabold font-mono text-slate-900">
                    {formatMoney(tableTotals.totalAmount)}
                  </span>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    disabled={activeTable.items.length === 0}
                    onClick={() => openCheckoutWithMode('FULL')}
                    className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Cobrar Cuenta Completa</span>
                  </button>
                  {activeTable.status !== 'LIBRE' && (
                    <button
                      type="button"
                      onClick={() => setConfirmClearModal(true)}
                      title="Vaciar / Liberar Mesa"
                      className="px-3 py-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Liberar</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL CONFIRMAR ELIMINAR MESA DEL MAPA (SOLO ADMIN) */}
      {confirmDeleteTableModal && activeTable && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                Eliminar {activeTable.name} del Mapa
              </h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteTableModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-xs text-slate-600 space-y-2">
              <p>
                ¿Deseas eliminar permanentemente la{' '}
                <strong>{activeTable.name}</strong> ({activeTable.zone}) del mapa del restaurante?
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTableModal(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteTable}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Eliminar Mesa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CAMBIAR / UNIR MESAS */}
      {showMoveMergeModal && activeTable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleMoveOrMergeTable}
            className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  Cambiar o Unir Mesa • {activeTable.name}
                </h3>
                <p className="text-[11px] text-slate-300">
                  Si eliges una mesa libre se transfiere; si está ocupada se fusionan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoveMergeModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <label className="block text-[11px] font-bold uppercase text-slate-500">
                Seleccionar Mesa Destino
              </label>
              <select
                value={targetTableId}
                onChange={(e) => setTargetTableId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
              >
                {tables
                  .filter((t) => t.id !== activeTable.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.zone}) —{' '}
                      {t.status === 'LIBRE'
                        ? 'LIBRE (Transferir cuenta)'
                        : `OCUPADA (Unir cuentas)`}
                    </option>
                  ))}
              </select>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMoveMergeModal(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                Confirmar Cambio / Unión
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL CONFIRMAR LIBERAR / VACIAR MESA */}
      {confirmClearModal && activeTable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                Liberar / Vaciar {activeTable.name}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmClearModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-xs text-slate-600 space-y-2">
              <p>
                ¿Estás seguro de que deseas vaciar y marcar como{' '}
                <strong>LIBRE</strong> la <strong>{activeTable.name}</strong>?
              </p>
              <p className="text-[11px] text-slate-400">
                Úsalo cuando los clientes se retiran sin consumir o tras haber cobrado todas las partes divididas.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClearModal(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleMarkTableFree}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Sí, Liberar Mesa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA MESA */}
      {showNewTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTable}
            className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Agregar Nueva Mesa</h3>
              <button
                type="button"
                onClick={() => setShowNewTableModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                  Nombre / Número de Mesa
                </label>
                <input
                  type="text"
                  required
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Ej: Mesa 09 o VIP-03"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Zona
                  </label>
                  <select
                    value={newTableZone}
                    onChange={(e) =>
                      setNewTableZone(e.target.value as RestaurantZone)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                  >
                    <option value="SALON">SALON</option>
                    <option value="TERRAZA">TERRAZA</option>
                    <option value="VIP">VIP</option>
                    <option value="EVENTOS">EVENTOS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Capacidad (Pers.)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewTableModal(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
              >
                Guardar Mesa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE COBRO Y EMISIÓN NCF / ORDEN INTERNA */}
      {showCheckoutModal && activeTable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">
                  {checkoutType === 'SELECTED_ITEMS'
                    ? `Facturar Platos Seleccionados • ${activeTable.name}`
                    : checkoutType === 'PART_SHARE'
                      ? `Facturar Parte 1/${splitCount} • ${activeTable.name}`
                      : `Facturar Cuenta Completa • ${activeTable.name}`}
                </h3>
                <p className="text-[11px] text-slate-300">
                  Total a cobrar: {formatMoney(checkoutTotals.totalAmount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                Cerrar
              </button>
            </div>

            <div className="p-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {errorMsg}
                </div>
              )}

              {/* Selector Fiscal vs Interno (Sin Impuestos) */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setIsFiscal(false);
                  }}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    !isFiscal
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5 text-slate-600" />
                  <span>Recibo Interno (0% ITBIS)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsFiscal(true);
                    setExemptItbisOnTable(false);
                  }}
                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    isFiscal
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Con NCF (+18% ITBIS)</span>
                </button>
              </div>

              {isFiscal && (
                <div className="flex gap-1.5">
                  {(['B02', 'B01'] as NCFType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNcfType(type)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        ncfType === type
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {type === 'B01'
                        ? 'B01 • Crédito Fiscal'
                        : 'B02 • Consumo'}
                    </button>
                  ))}
                </div>
              )}

              {/* Checkbox de Propina Legal dentro del Modal de Cobro */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                <label className="flex items-center gap-2 font-semibold text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeTable.includeLegalTip}
                    onChange={(e) =>
                      handleUpdateTableMeta({
                        includeLegalTip: e.target.checked,
                      })
                    }
                    className="rounded accent-amber-600"
                  />
                  <span>Incluir 10% Propina Legal</span>
                </label>
                <span className="font-mono font-bold text-amber-900">
                  {formatMoney(checkoutTotals.legalTipAmount)}
                </span>
              </div>

              {/* Propina Voluntaria / Extra Mesero (RD$) */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <label className="font-semibold text-slate-700">
                  Propina Voluntaria / Extra Mesero (RD$):
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={voluntaryTipInput}
                  onChange={(e) => setVoluntaryTipInput(e.target.value)}
                  placeholder="0.00"
                  className="w-28 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-right font-mono font-bold text-slate-900 text-xs"
                />
              </div>

              {Number(voluntaryTipInput) > 0 && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900">
                  <span>Total Final + Propina Voluntaria:</span>
                  <span className="font-mono">
                    {formatMoney(
                      checkoutTotals.totalAmount +
                        Math.max(0, Number(voluntaryTipInput) || 0)
                    )}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Datos del Comensal / Cliente
                </label>
                <input
                  type="text"
                  value={customCustomerName}
                  onChange={(e) => setCustomCustomerName(e.target.value)}
                  placeholder="Nombre o Razón Social"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customCustomerRnc}
                    onChange={(e) => setCustomCustomerRnc(e.target.value)}
                    placeholder={
                      isFiscal && ncfType === 'B01'
                        ? 'RNC/Cédula (Obligatorio)'
                        : 'RNC o Cédula'
                    }
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                      isFiscal && ncfType === 'B01' && !customCustomerRnc
                        ? 'border-amber-400 bg-amber-50/40'
                        : 'border-slate-200'
                    }`}
                  />
                  <input
                    type="text"
                    value={customCustomerPhone}
                    onChange={(e) => setCustomCustomerPhone(e.target.value)}
                    placeholder="Teléfono WhatsApp"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Método de Pago
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
                      { id: 'TARJETA', label: 'Tarjeta', icon: CreditCard },
                      {
                        id: 'TRANSFERENCIA',
                        label: 'Transf.',
                        icon: Landmark,
                      },
                    ] as const
                  ).map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          paymentMethod === m.id
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCloseTableAndPay}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isSubmitting ? 'Procesando...' : 'Emitir Comprobante'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BARRA FLOTANTE INFERIOR EN MÓVIL CUANDO HAY MESA ACTIVA */}
      {activeTable && activeTable.items.length > 0 && (
        <div className="fixed bottom-16 inset-x-3 z-30 lg:hidden bg-slate-900 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-amber-400 block truncate">
              {activeTable.name} • {activeTable.items.length} ítems
            </span>
            <span className="text-sm font-mono font-extrabold text-white">
              {formatMoney(tableTotals.totalAmount)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleSendKitchenCommand('ALL')}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Comandar Nuevos</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileSectionTab('BILL');
                openCheckoutWithMode('FULL');
              }}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ver Cuenta / Cobrar</span>
            </button>
          </div>
        </div>
      )}

      {printDoc && (
        <InvoicePrintModal data={printDoc} onClose={() => setPrintDoc(null)} />
      )}
    </div>
  );
};
