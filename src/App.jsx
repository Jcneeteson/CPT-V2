import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import { solveCPT } from './lib/solver';
import {
  getConfiguration,
  saveConfiguration,
  DEFAULT_ALLOCATION_RULES,
  DEFAULT_CASHFLOW_PROFILES,
  DEFAULT_NOTIFICATION_EMAIL,
  NET_POSITION_PROFILES
} from './config/dummyData';

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Configuration State (Profiles, Rules)
  // Configuration State (Profiles, Rules)
  // Use lazy init to avoid effect-based state setting
  const [config, setConfig] = useState(() => {
    const loaded = getConfiguration();
    // Maintain backward compatibility for netPositions
    if (loaded && !loaded.netPositions) {
      loaded.netPositions = NET_POSITION_PROFILES;
    }
    return loaded || {
      profiles: DEFAULT_CASHFLOW_PROFILES,
      rules: DEFAULT_ALLOCATION_RULES,
      netPositions: NET_POSITION_PROFILES,
      notificationEmail: DEFAULT_NOTIFICATION_EMAIL
    };
  });

  // Simulation State (Inputs)
  // Initialize from LocalStorage if available
  const [params, setParams] = useState(() => {
    const saved = localStorage.getItem('cpt_dashboard_params');
    const defaults = {
      availableCapital: 10000000,
      startYear: 2026,
      horizon: 15,
      maxYearlyChange: 0.20,
      firstYearCap: 0.25
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Safety check for massive numbers (e.g. storage corruption or overflow bugs)
        // Cap at 1 Trillion (1e12) to prevent calculation errors
        if (!parsed.availableCapital || parsed.availableCapital > 1000000000000 || isNaN(parsed.availableCapital)) {
          parsed.availableCapital = 10000000;
        }
        return { ...defaults, ...parsed };
      } catch {
        return defaults;
      }
    }
    return defaults;
  });

  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('cpt_dashboard_categories');
    return saved ? JSON.parse(saved) : {
      secondaries: true,
      pe: true,
      vc: true
    };
  });

  // New: Manual Overrides State
  // Structure: { [yearIndex]: { category: amount } }
  // Persist? Maybe not necessary for prototype, but useful.
  const [manualOverrides, setManualOverrides] = useState({});



  // 1. Persist Config on Change (Effect replaced the old "Load on Mount" effect)
  // Since we lazy loaded, we only need to save when it changes.
  useEffect(() => {
    // Optional: Auto-save config if it changes? 
    // The previous code only loaded on mount. getConfiguration reads from dummyData (localStorage wrapper).
    // If we want to sync config changes to storage, handleConfigChange does that manually.
    // So we don't need an effect here for config unless we want to auto-save.
  }, [config]);

  // 2. Persist Inputs on Change
  useEffect(() => {
    localStorage.setItem('cpt_dashboard_params', JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem('cpt_dashboard_categories', JSON.stringify(categories));
  }, [categories]);

  // 3. Derived State: Run Solver when dependencies change
  // Use useMemo instead of useEffect+useState to avoid double renders and side-effects during render
  const result = React.useMemo(() => {
    if (!params.availableCapital || params.availableCapital <= 0) return null;

    try {
      return solveCPT({
        availableCapital: params.availableCapital,
        startYear: params.startYear,
        planningHorizon: params.horizon,
        projectionHorizon: 50,
        config: config,
        selectedCategories: categories,
        maxYearlyChange: params.maxYearlyChange,
        firstYearCap: params.firstYearCap,
        manualOverrides: manualOverrides
      });
    } catch (err) {
      console.error("Solver Error:", err);
      return null;
    }
  }, [params, categories, config, manualOverrides]);

  const handleConfigChange = (newConfig) => {
    setConfig(newConfig);
    saveConfiguration(newConfig);
  };

  return (
    <>
      <Layout
        sidebar={
          <Sidebar
            params={params}
            setParams={setParams}
            categories={categories}
            setCategories={setCategories}
            result={result}
          />
        }
        main={
          <Dashboard
            result={result}
            params={params}
            config={config}
            onOpenSettings={() => setIsSettingsOpen(true)}
            manualOverrides={manualOverrides}
            setManualOverrides={setManualOverrides}
          />
        }
      />

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          config={config}
          onConfigChange={handleConfigChange}
        />
      )}
    </>
  );
}

export default App;
