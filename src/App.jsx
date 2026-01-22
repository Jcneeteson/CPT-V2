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
  const [config, setConfig] = useState({
    profiles: DEFAULT_CASHFLOW_PROFILES,
    rules: DEFAULT_ALLOCATION_RULES,
    netPositions: NET_POSITION_PROFILES,
    notificationEmail: DEFAULT_NOTIFICATION_EMAIL
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
        return { ...defaults, ...JSON.parse(saved) };
      } catch (e) {
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

  // Solver Result State (can be transient, but we persist to avoid recalc flicker)
  const [result, setResult] = useState(null);

  // 1. Load Config on Mount
  useEffect(() => {
    const loaded = getConfiguration();
    if (loaded) {
      // Ensure netPositions exists (backward compatibility)
      if (!loaded.netPositions) {
        loaded.netPositions = NET_POSITION_PROFILES;
      }
      setConfig(loaded);
    }
  }, []);

  // 2. Persist Inputs on Change
  useEffect(() => {
    localStorage.setItem('cpt_dashboard_params', JSON.stringify(params));
  }, [params]);

  useEffect(() => {
    localStorage.setItem('cpt_dashboard_categories', JSON.stringify(categories));
  }, [categories]);

  // 3. Run Solver when dependencies change
  useEffect(() => {
    // Only solve if we have valid inputs
    if (params.availableCapital > 0) {
      try {
        const res = solveCPT({
          availableCapital: params.availableCapital,
          startYear: params.startYear,
          planningHorizon: params.horizon, // User Input: "Investment Horizon"
          projectionHorizon: 50,          // Fixed: "Simulation Duration"
          config: config,
          selectedCategories: categories,
          maxYearlyChange: params.maxYearlyChange,
          firstYearCap: params.firstYearCap
        });
        setResult(res);
      } catch (err) {
        console.error("Solver Error:", err);
        // Optional: Set an error state to display in UI?
      }
    }
  }, [params, categories, config]);

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
          />
        }
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onConfigChange={handleConfigChange}
      />
    </>
  );
}

export default App;
