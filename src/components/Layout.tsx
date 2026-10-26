import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Check,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  KeyRound,
  PanelLeft,
  PanelLeftClose,
  Phone,
  Settings,
  Shield,
  ShoppingBag,
  UserCheck,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  db,
  INITIAL_STAFF_USERS,
  logAuditAction,
  type BrandId,
  type BrandProfile,
  type StaffUser,
  type UserRole,
} from '../db/db';
import { BrandLogo } from './BrandLogo';

export type NavSection =
  | 'SERVICES'
  | 'POS'
  | 'RESTAURANT'
  | 'CATALOG'
  | 'REPORTS'
  | 'SETTINGS';

interface LayoutProps {
  brands: BrandProfile[];
  activeBrand: BrandProfile;
  onSelectBrand: (brandId: BrandId) => void;
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  children: React.ReactNode;
}

const VIEW_TITLES: Record<NavSection, string> = {
  SERVICES: 'Órdenes y Servicios',
  POS: 'Punto de Venta',
  RESTAURANT: 'Mesas / Eventos',
  CATALOG: 'Clientes y Catálogo',
  REPORTS: 'Reportes DGII (606 / 607)',
  SETTINGS: 'Panel Admin & Configuración NCF',
};

const SHORT_MOBILE_LABELS: Record<NavSection, string> = {
  SERVICES: 'Servicios',
  POS: 'POS',
  RESTAURANT: 'Mesas',
  CATALOG: 'Catálogo',
  REPORTS: '606/607',
  SETTINGS: 'Admin',
};

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  ADMIN: 'bg-slate-900 text-white border-slate-900',
  CAJERO: 'bg-teal-50 text-teal-800 border-teal-200',
  CAMARERO: 'bg-amber-50 text-amber-800 border-amber-200',
  TECNICO: 'bg-sky-50 text-sky-800 border-sky-200',
};

const ACTIVE_USER_STORAGE_KEY = 'bridgepos_active_user_id';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'bridgepos_sidebar_collapsed';

export const Layout: React.FC<LayoutProps> = ({
  brands,
  activeBrand,
  onSelectBrand,
  activeNav,
  onSelectNav,
  children,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [brandDropdownOpen, setBrandDropdownOpen] = useState<boolean>(false);
  const [mobileBrandDropdownOpen, setMobileBrandDropdownOpen] =
    useState<boolean>(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);

  // Estado persistente para Sidebar Colapsable en Escritorio
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    }
    return false;
  });

  // Modal de Validación de PIN al Cambiar de Operador
  const [pendingUserForPin, setPendingUserForPin] = useState<StaffUser | null>(
    null
  );
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  const staffUsers =
    useLiveQuery(() => db.staffUsers.toArray(), []) ?? INITIAL_STAFF_USERS;

  const [activeUserId, setActiveUserId] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(ACTIVE_USER_STORAGE_KEY) || 'user-admin';
    }
    return 'user-admin';
  });

  const activeUser: StaffUser =
    staffUsers.find((u) => u.id === activeUserId && u.active) ||
    staffUsers.find((u) => u.active) ||
    INITIAL_STAFF_USERS[0];

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      }
      return next;
    });
  };

  const isAdmin = activeUser.role === 'ADMIN';
  const isCamarero = activeUser.role === 'CAMARERO';

  // Si un camarero o cajero estaba en una pestaña exclusiva de Admin, redirigirlo automáticamente
  useEffect(() => {
    if (!isAdmin && (activeNav === 'REPORTS' || activeNav === 'SETTINGS')) {
      if (activeBrand.activeModules.includes('RESTAURANT_MODULE')) {
        onSelectNav('RESTAURANT');
      } else if (activeBrand.activeModules.includes('SERVICE_MODULE')) {
        onSelectNav('SERVICES');
      } else {
        onSelectNav('POS');
      }
    }
  }, [isAdmin, activeNav, activeBrand, onSelectNav]);

  const activateUserSession = async (user: StaffUser) => {
    setActiveUserId(user.id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_USER_STORAGE_KEY, user.id);
      window.dispatchEvent(new Event('bridgepos-user-changed'));
    }
    setUserDropdownOpen(false);
    setPendingUserForPin(null);
    setPinInput('');
    setPinError(null);
    await logAuditAction({
      user,
      brandId: activeBrand.id,
      action: 'CAMBIO_USUARIO',
      details: `Sesión activa cambiada a ${user.name} (${user.role})`,
    });
  };

  const handleRequestSelectUser = (user: StaffUser) => {
    setUserDropdownOpen(false);
    if (user.id === activeUser.id) return;

    if (user.pin && user.pin.trim() !== '') {
      setPendingUserForPin(user);
      setPinInput('');
      setPinError(null);
    } else {
      void activateUserSession(user);
    }
  };

  const handlePinDigit = (digit: string) => {
    if (!pendingUserForPin) return;
    setPinError(null);
    const nextPin = (pinInput + digit).slice(0, 6);
    setPinInput(nextPin);

    if (nextPin === pendingUserForPin.pin) {
      void activateUserSession(pendingUserForPin);
    } else if (nextPin.length >= pendingUserForPin.pin.length) {
      setPinError('PIN incorrecto. Intenta nuevamente.');
      setTimeout(() => setPinInput(''), 350);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserForPin) return;
    if (pinInput.trim() === pendingUserForPin.pin.trim()) {
      void activateUserSession(pendingUserForPin);
    } else {
      setPinError('PIN incorrecto. Intenta nuevamente.');
      setPinInput('');
    }
  };

  const hasServices = activeBrand.activeModules.includes('SERVICE_MODULE');
  const hasRetail = activeBrand.activeModules.includes('RETAIL_MODULE');
  const hasRestaurant = activeBrand.activeModules.includes('RESTAURANT_MODULE');

  const navItems: {
    id: NavSection;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }[] = [
    {
      id: 'SERVICES',
      label: 'Órdenes y Servicios',
      shortLabel: SHORT_MOBILE_LABELS.SERVICES,
      icon: ClipboardList,
      visible: hasServices && !isCamarero,
    },
    {
      id: 'POS',
      label: 'Punto de Venta',
      shortLabel: SHORT_MOBILE_LABELS.POS,
      icon: ShoppingBag,
      visible: hasRetail && !isCamarero,
    },
    {
      id: 'RESTAURANT',
      label: 'Mesas / Eventos',
      shortLabel: SHORT_MOBILE_LABELS.RESTAURANT,
      icon: UtensilsCrossed,
      visible: hasRestaurant,
    },
    {
      id: 'CATALOG',
      label: 'Clientes y Catálogo',
      shortLabel: SHORT_MOBILE_LABELS.CATALOG,
      icon: Users,
      visible: !isCamarero,
    },
    {
      id: 'REPORTS',
      label: 'Reportes 606 / 607',
      shortLabel: SHORT_MOBILE_LABELS.REPORTS,
      icon: FileSpreadsheet,
      visible: isAdmin,
    },
    {
      id: 'SETTINGS',
      label: 'Panel Admin & NCF',
      shortLabel: SHORT_MOBILE_LABELS.SETTINGS,
      icon: Settings,
      visible: isAdmin,
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      {/* SIDEBAR IZQUIERDO EN ESCRITORIO (hidden lg:flex, w-64 expandido / w-20 colapsado) */}
      <aside
        className={`no-print hidden lg:flex ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } bg-white border-r border-slate-200/90 flex-col justify-between shrink-0 select-none transition-all duration-200`}
      >
        <div className="p-3 space-y-5">
          {/* BOTÓN COLAPSAR / EXPANDIR SIDEBAR */}
          <div
            className={`flex items-center ${
              isSidebarCollapsed ? 'justify-center' : 'justify-between px-1'
            }`}
          >
            {!isSidebarCollapsed && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Unidad de Negocio
              </span>
            )}
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title={
                isSidebarCollapsed
                  ? 'Expandir menú lateral'
                  : 'Colapsar menú lateral (Maximizar espacio)'
              }
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {isSidebarCollapsed ? (
                <PanelLeft className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* SELECTOR DE DIVISIÓN / MARCA */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setBrandDropdownOpen((prev) => !prev)}
              title={`Marca activa: ${activeBrand.name} (Clic para cambiar)`}
              className={`w-full rounded-xl ${
                isSidebarCollapsed ? 'p-1.5' : 'p-2.5'
              } bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/80 transition-all text-left flex flex-col items-center gap-2`}
            >
              <BrandLogo
                brandId={activeBrand.id}
                size={isSidebarCollapsed ? 'sm' : 'md'}
                className={
                  isSidebarCollapsed
                    ? 'w-12 h-10 overflow-hidden'
                    : 'w-full h-20'
                }
              />

              {!isSidebarCollapsed && (
                <div className="w-full flex items-center justify-between px-1">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {activeBrand.name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {activeBrand.subtitle}
                    </p>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      brandDropdownOpen ? 'rotate-180 text-slate-700' : ''
                    }`}
                  />
                </div>
              )}
            </button>

            {/* DROPDOWN DE LAS 4 UNIDADES DE NEGOCIO */}
            {brandDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setBrandDropdownOpen(false)}
                />
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5 space-y-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Cambiar Unidad de Negocio
                  </div>
                  {brands.map((b) => {
                    const selected = b.id === activeBrand.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          onSelectBrand(b.id);
                          setBrandDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all ${
                          selected
                            ? 'bg-slate-900 text-white'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <BrandLogo
                          brandId={b.id}
                          size="sm"
                          className="w-16 h-10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs font-semibold truncate ${
                              selected ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {b.name}
                          </p>
                          <p
                            className={`text-[10px] truncate ${
                              selected ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {b.subtitle}
                          </p>
                        </div>
                        {selected && (
                          <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* MENÚ DE NAVEGACIÓN LIMPIO */}
          <nav className="space-y-1">
            {!isSidebarCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Operaciones ({activeUser.role})
              </div>
            )}
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => onSelectNav(item.id)}
                  className={`w-full flex items-center ${
                    isSidebarCollapsed
                      ? 'justify-center p-3'
                      : 'gap-3 px-3 py-2.5'
                  } rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-teal-400' : 'text-slate-400'
                    }`}
                  />
                  {!isSidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* FOOTER DEL SIDEBAR: ESTADO EN LÍNEA DISCRETO */}
        <div
          className={`p-3 border-t border-slate-200/80 flex items-center ${
            isSidebarCollapsed ? 'justify-center' : 'justify-between'
          } text-xs text-slate-500`}
        >
          <div
            className="flex items-center gap-2"
            title={isOnline ? 'En línea' : 'Modo local'}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isOnline ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            {!isSidebarCollapsed && (
              <span className="font-medium text-slate-700">
                {isOnline ? 'En línea' : 'Modo local'}
              </span>
            )}
          </div>
          {!isSidebarCollapsed && (
            <span className="text-[11px] font-mono text-slate-400">v2.5</span>
          )}
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER SUPERIOR CON SELECTOR DE MARCA MÓVIL + OPERADOR Y ROL */}
        <header className="no-print h-16 bg-white border-b border-slate-200/80 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Selector compacto de unidad de negocio en móvil (< 1024px) */}
            <div className="relative lg:hidden">
              <button
                type="button"
                onClick={() => setMobileBrandDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-xs"
              >
                <span className="truncate max-w-[115px] sm:max-w-[180px]">
                  {activeBrand.name}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              </button>

              {mobileBrandDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMobileBrandDropdownOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 p-1.5 space-y-1">
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Unidad de Negocio
                    </div>
                    {brands.map((b) => {
                      const selected = b.id === activeBrand.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            onSelectBrand(b.id);
                            setMobileBrandDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs font-semibold ${
                            selected
                              ? 'bg-slate-900 text-white'
                              : 'hover:bg-slate-100 text-slate-800'
                          }`}
                        >
                          <div>
                            <div className="font-bold">{b.name}</div>
                            <div
                              className={`text-[10px] ${
                                selected ? 'text-slate-300' : 'text-slate-400'
                              }`}
                            >
                              {b.subtitle}
                            </div>
                          </div>
                          {selected && (
                            <Check className="w-4 h-4 text-teal-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
              {VIEW_TITLES[activeNav]}
            </h1>
            <span className="hidden lg:inline text-slate-300">•</span>
            <span className="hidden lg:inline text-xs font-medium text-slate-500">
              {activeBrand.name}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* SELECTOR DE OPERADOR / ROL ACTIVO */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-xs transition-all"
              >
                <UserCheck className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                <span className="font-semibold text-slate-900 truncate max-w-[95px] sm:max-w-none">
                  {activeUser.name}
                </span>
                <span
                  className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] font-bold border ${ROLE_BADGE_STYLES[activeUser.role]}`}
                >
                  {activeUser.role}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5 space-y-1">
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Cambiar Operador (PIN)</span>
                      <Shield className="w-3 h-3" />
                    </div>
                    {staffUsers
                      .filter((u) => u.active)
                      .map((u) => {
                        const isSelected = u.id === activeUser.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleRequestSelectUser(u)}
                            className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all ${
                              isSelected
                                ? 'bg-slate-900 text-white'
                                : 'hover:bg-slate-100 text-slate-800'
                            }`}
                          >
                            <div>
                              <div className="font-semibold flex items-center gap-1.5">
                                <span>{u.name}</span>
                                {u.pin && (
                                  <KeyRound className="w-3 h-3 opacity-60" />
                                )}
                              </div>
                              <div
                                className={`text-[10px] ${
                                  isSelected
                                    ? 'text-slate-300'
                                    : 'text-slate-400'
                                }`}
                              >
                                Rol: {u.role}
                              </div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isSelected
                                  ? 'bg-white/15 text-white border-white/20'
                                  : ROLE_BADGE_STYLES[u.role]
                              }`}
                            >
                              {u.role}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
            </div>

            <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700">
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-mono">{activeBrand.phone}</span>
            </div>
          </div>
        </header>

        {/* WORKSPACE PRINCIPAL CON PADDING INFERIOR MÓVIL */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* BOTTOM NAVIGATION BAR FIJA EN MÓVIL (< 1024px) */}
      <nav className="no-print fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex items-center justify-around py-2 px-1 shadow-lg lg:hidden">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectNav(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all min-w-[54px] ${
                active
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`w-4 h-4 ${
                  active ? 'text-teal-400' : 'text-slate-400'
                }`}
              />
              <span className="truncate">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* MODAL NUMÉRICO RÁPIDO DE 4 DÍGITOS PARA VALIDAR PIN DE OPERADOR */}
      {pendingUserForPin && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xs w-full overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-teal-400" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    Validar PIN de Acceso
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {pendingUserForPin.name} ({pendingUserForPin.role})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingUserForPin(null);
                  setPinInput('');
                  setPinError(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePinSubmit} className="p-5 space-y-4">
              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => {
                    setPinError(null);
                    const val = e.target.value.replace(/\D/g, '');
                    setPinInput(val);
                    if (val === pendingUserForPin.pin) {
                      void activateUserSession(pendingUserForPin);
                    }
                  }}
                  placeholder="••••"
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono font-bold py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-slate-900"
                />
                {pinError && (
                  <p className="text-[11px] text-rose-600 font-semibold text-center mt-1.5">
                    {pinError}
                  </p>
                )}
              </div>

              {/* Teclado numérico táctil rápido */}
              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handlePinDigit(digit)}
                    className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-900 active:text-white font-mono text-base font-bold text-slate-900 transition-colors"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setPinError(null);
                  }}
                  className="py-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold"
                >
                  Borrar
                </button>
                <button
                  type="button"
                  onClick={() => handlePinDigit('0')}
                  className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-900 active:text-white font-mono text-base font-bold text-slate-900 transition-colors"
                >
                  0
                </button>
                <button
                  type="submit"
                  className="py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                >
                  Entrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
