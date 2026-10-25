import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Check,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  Phone,
  Settings,
  Shield,
  ShoppingBag,
  UserCheck,
  Users,
  UtensilsCrossed,
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

const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  ADMIN: 'bg-slate-900 text-white border-slate-900',
  CAJERO: 'bg-teal-50 text-teal-800 border-teal-200',
  CAMARERO: 'bg-amber-50 text-amber-800 border-amber-200',
  TECNICO: 'bg-sky-50 text-sky-800 border-sky-200',
};

const ACTIVE_USER_STORAGE_KEY = 'bridgepos_active_user_id';

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
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);

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

  const handleSelectUser = async (user: StaffUser) => {
    setActiveUserId(user.id);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_USER_STORAGE_KEY, user.id);
      window.dispatchEvent(new Event('bridgepos-user-changed'));
    }
    setUserDropdownOpen(false);
    await logAuditAction({
      user,
      brandId: activeBrand.id,
      action: 'CAMBIO_USUARIO',
      details: `Sesión activa cambiada a ${user.name} (${user.role})`,
    });
  };

  const hasServices = activeBrand.activeModules.includes('SERVICE_MODULE');
  const hasRetail = activeBrand.activeModules.includes('RETAIL_MODULE');
  const hasRestaurant = activeBrand.activeModules.includes('RESTAURANT_MODULE');

  const navItems: {
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }[] = [
    {
      id: 'SERVICES',
      label: 'Órdenes y Servicios',
      icon: ClipboardList,
      visible: hasServices && !isCamarero,
    },
    {
      id: 'POS',
      label: 'Punto de Venta',
      icon: ShoppingBag,
      visible: hasRetail && !isCamarero,
    },
    {
      id: 'RESTAURANT',
      label: 'Mesas / Eventos',
      icon: UtensilsCrossed,
      visible: hasRestaurant,
    },
    {
      id: 'CATALOG',
      label: 'Clientes y Catálogo',
      icon: Users,
      visible: !isCamarero,
    },
    {
      id: 'REPORTS',
      label: 'Reportes 606 / 607',
      icon: FileSpreadsheet,
      visible: isAdmin,
    },
    {
      id: 'SETTINGS',
      label: 'Panel Admin & NCF',
      icon: Settings,
      visible: isAdmin,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      {/* SIDEBAR IZQUIERDO FIJO (w-64) */}
      <aside className="no-print w-64 bg-white border-r border-slate-200/90 flex flex-col justify-between shrink-0 select-none">
        <div className="p-4 space-y-6">
          {/* SELECTOR DE DIVISIÓN / MARCA */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setBrandDropdownOpen((prev) => !prev)}
              className="w-full rounded-xl p-2.5 bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/80 transition-all text-left flex flex-col items-center gap-2.5"
            >
              <BrandLogo
                brandId={activeBrand.id}
                size="md"
                className="w-full h-20"
              />

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
            </button>

            {/* DROPDOWN DE LAS 4 UNIDADES DE NEGOCIO */}
            {brandDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setBrandDropdownOpen(false)}
                />
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5 space-y-1">
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
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Operaciones ({activeUser.role})
            </div>
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      active
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        active ? 'text-teal-400' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
          </nav>
        </div>

        {/* FOOTER DEL SIDEBAR: ESTADO EN LÍNEA DISCRETO */}
        <div className="p-4 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="font-medium text-slate-700">
              {isOnline ? 'En línea' : 'Modo local'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">v2.0</span>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER SUPERIOR CON SELECTOR DE USUARIO Y ROL */}
        <header className="no-print h-16 bg-white border-b border-slate-200/80 px-6 lg:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              {VIEW_TITLES[activeNav]}
            </h1>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-medium text-slate-500">
              {activeBrand.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* SELECTOR DE OPERADOR / ROL ACTIVO */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-xs transition-all"
              >
                <UserCheck className="w-3.5 h-3.5 text-slate-700" />
                <span className="font-semibold text-slate-900">
                  {activeUser.name}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ROLE_BADGE_STYLES[activeUser.role]}`}
                >
                  {activeUser.role}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5 space-y-1">
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                      <span>Cambiar Operador Activo</span>
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
                            onClick={() => handleSelectUser(u)}
                            className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all ${
                              isSelected
                                ? 'bg-slate-900 text-white'
                                : 'hover:bg-slate-100 text-slate-800'
                            }`}
                          >
                            <div>
                              <div className="font-semibold">{u.name}</div>
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

            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-700">
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-mono">{activeBrand.phone}</span>
            </div>
          </div>
        </header>

        {/* WORKSPACE */}
        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
