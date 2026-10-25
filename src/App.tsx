import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  ensureDatabaseSeeded,
  INITIAL_BRANDS,
  INITIAL_CATALOG_ITEMS,
  INITIAL_CLIENTS,
  INITIAL_CORPORATE_CONFIG,
  INITIAL_NCF_SEQUENCES,
  INITIAL_RESTAURANT_TABLES,
  INITIAL_SERVICE_ORDERS,
  type BrandId,
} from './db/db';
import { Layout, type NavSection } from './components/Layout';
import { SettingsView } from './views/SettingsView';
import { ServiceOrdersView } from './views/ServiceOrdersView';
import { ClientsCatalogView } from './views/ClientsCatalogView';
import { RetailPOSView } from './views/RetailPOSView';
import { RestaurantView } from './views/RestaurantView';
import { DGIIReportsView } from './views/DGIIReportsView';

const ACTIVE_BRAND_STORAGE_KEY = 'bridgepos_active_brand_id';

export function App() {
  const [selectedBrandId, setSelectedBrandId] = useState<BrandId>(() => {
    const saved = localStorage.getItem(
      ACTIVE_BRAND_STORAGE_KEY
    ) as BrandId | null;
    if (
      saved &&
      ['bridge-tech', 'atelier', 'sb-mantenimiento', 'metro-food'].includes(
        saved
      )
    ) {
      return saved;
    }
    return 'bridge-tech';
  });

  const [activeNav, setActiveNav] = useState<NavSection>(() =>
    selectedBrandId === 'metro-food' ? 'RESTAURANT' : 'SERVICES'
  );

  useEffect(() => {
    ensureDatabaseSeeded().catch(console.error);
  }, []);

  const corporate =
    useLiveQuery(() => db.corporateConfig.get('corporate-main'), []) ??
    INITIAL_CORPORATE_CONFIG;

  const brands =
    useLiveQuery(() => db.brands.toArray(), []) ?? INITIAL_BRANDS;

  const ncfSequences =
    useLiveQuery(() => db.ncfSequences.toArray(), []) ??
    INITIAL_NCF_SEQUENCES;

  const allDocuments =
    useLiveQuery(() => db.documents.orderBy('id').reverse().toArray(), []) ??
    [];

  const clients =
    useLiveQuery(() => db.clients.toArray(), []) ?? INITIAL_CLIENTS;

  const catalogItems =
    useLiveQuery(() => db.catalogItems.toArray(), []) ??
    INITIAL_CATALOG_ITEMS;

  const serviceOrders =
    useLiveQuery(() => db.serviceOrders.orderBy('id').reverse().toArray(), []) ??
    INITIAL_SERVICE_ORDERS;

  const restaurantTables =
    useLiveQuery(() => db.restaurantTables.toArray(), []) ??
    INITIAL_RESTAURANT_TABLES;

  const activeBrand =
    brands.find((b) => b.id === selectedBrandId) ||
    brands[0] ||
    INITIAL_BRANDS[0];

  const handleSelectBrand = (brandId: BrandId) => {
    setSelectedBrandId(brandId);
    localStorage.setItem(ACTIVE_BRAND_STORAGE_KEY, brandId);

    const targetBrand = brands.find((b) => b.id === brandId);
    if (!targetBrand) return;

    if (
      activeNav === 'SERVICES' &&
      !targetBrand.activeModules.includes('SERVICE_MODULE')
    ) {
      if (targetBrand.activeModules.includes('RESTAURANT_MODULE')) {
        setActiveNav('RESTAURANT');
      } else if (targetBrand.activeModules.includes('RETAIL_MODULE')) {
        setActiveNav('POS');
      } else {
        setActiveNav('CATALOG');
      }
    } else if (
      activeNav === 'RESTAURANT' &&
      !targetBrand.activeModules.includes('RESTAURANT_MODULE')
    ) {
      if (targetBrand.activeModules.includes('SERVICE_MODULE')) {
        setActiveNav('SERVICES');
      } else if (targetBrand.activeModules.includes('RETAIL_MODULE')) {
        setActiveNav('POS');
      }
    } else if (
      activeNav === 'POS' &&
      !targetBrand.activeModules.includes('RETAIL_MODULE')
    ) {
      if (targetBrand.activeModules.includes('SERVICE_MODULE')) {
        setActiveNav('SERVICES');
      }
    }
  };

  return (
    <Layout
      brands={brands}
      activeBrand={activeBrand}
      onSelectBrand={handleSelectBrand}
      activeNav={activeNav}
      onSelectNav={setActiveNav}
    >
      {activeNav === 'SERVICES' ? (
        <ServiceOrdersView
          activeBrand={activeBrand}
          corporate={corporate}
          ncfSequences={ncfSequences}
          orders={serviceOrders}
          clients={clients}
          catalogItems={catalogItems}
        />
      ) : activeNav === 'POS' ? (
        <RetailPOSView
          activeBrand={activeBrand}
          corporate={corporate}
          ncfSequences={ncfSequences}
          catalogItems={catalogItems}
          clients={clients}
        />
      ) : activeNav === 'RESTAURANT' ? (
        <RestaurantView
          activeBrand={activeBrand}
          corporate={corporate}
          ncfSequences={ncfSequences}
          tables={restaurantTables}
          catalogItems={catalogItems}
        />
      ) : activeNav === 'CATALOG' ? (
        <ClientsCatalogView
          activeBrand={activeBrand}
          clients={clients}
          catalogItems={catalogItems}
        />
      ) : activeNav === 'REPORTS' ? (
        <DGIIReportsView
          corporate={corporate}
          activeBrand={activeBrand}
          ncfSequences={ncfSequences}
          documents={allDocuments}
        />
      ) : (
        <SettingsView
          corporate={corporate}
          brands={brands}
          activeBrand={activeBrand}
          onSelectBrand={handleSelectBrand}
          ncfSequences={ncfSequences}
          recentDocuments={allDocuments.slice(0, 10)}
        />
      )}
    </Layout>
  );
}

export default App;
