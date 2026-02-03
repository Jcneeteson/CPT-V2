import React, { useState } from 'react';
import { Save, RefreshCw, X, AlertTriangle, Upload, FileSpreadsheet } from 'lucide-react';
import { resetConfiguration } from '../config/dummyData';
import { parseFundData } from '../lib/excelImport';

export default function SettingsModal({ isOpen, onClose, config, onConfigChange }) {
    // Local state for the editable configuration
    // Initialize directly from props since this component is now conditionally rendered (re-mounted on open)
    const [localConfig, setLocalConfig] = useState(() => JSON.parse(JSON.stringify(config)));
    const [error, setError] = useState(null);
    const [importMsg, setImportMsg] = useState(null);

    if (!isOpen || !localConfig) return null;

    const handleCellChange = (category, yearIndex, value) => {
        const numVal = parseFloat(value);
        if (isNaN(numVal)) return;

        // Update profile
        setLocalConfig(prev => {
            const next = { ...prev };
            // Ensure array exists
            if (!next.profiles[category]) return prev;
            // Update value
            next.profiles[category] = [...next.profiles[category]];
            next.profiles[category][yearIndex] = numVal;
            return next;
        });
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setImportMsg("Bestand verwerken...");
            setError(null);

            const newProfiles = await parseFundData(file);

            setLocalConfig(prev => {
                const next = { ...prev };
                // Merge found profiles
                if (newProfiles.pe) next.profiles.pe = newProfiles.pe;
                if (newProfiles.vc) next.profiles.vc = newProfiles.vc;
                if (newProfiles.secondaries) next.profiles.secondaries = newProfiles.secondaries;
                return next;
            });

            setImportMsg("Succesvol geïmporteerd! Profielen zijn bijgewerkt.");
        } catch (err) {
            console.error(err);
            setError("Import mislukt: " + err.message);
            setImportMsg(null);
        }
    };

    const handleSave = () => {
        try {
            onConfigChange(localConfig);
            setError(null);
            onClose();
        } catch (e) {
            setError('Fout bij opslaan: ' + e.message);
        }
    };

    const handleReset = () => {
        if (confirm('Herstel standaardwaarden?')) {
            const defaults = resetConfiguration();
            setLocalConfig(defaults);
            setImportMsg(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-[#0B1E3D] rounded-t-xl">
                    <div>
                        <h2 className="text-lg font-bold text-white">Geavanceerde Instellingen</h2>
                        <p className="text-xs text-gray-300">Bewerk cashflow profielen direct in de tabel.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-300 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm border border-red-200">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    {/* Editable Table: Cashflow Profiles */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                            <h3 className="text-sm font-bold text-gray-700 uppercase">Cashflow J-Curves (Netto Kasstroom Ratio)</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-right">
                                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-3 text-left w-40 border-r border-gray-100 sticky left-0 bg-gray-50 z-10">Jaar {' > '}</th>
                                        {Array.from({ length: 15 }).map((_, i) => (
                                            <th key={i} className="px-3 py-3 min-w-[85px] border-r border-gray-100 uppercase tracking-tight">Y{i + 1}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {['secondaries', 'pe', 'vc'].map(cat => (
                                        <tr key={cat} className="hover:bg-gray-50 group">
                                            <td className="px-4 py-4 font-bold text-left text-[#0B1E3D] uppercase border-r border-gray-100 sticky left-0 bg-white z-10">
                                                {cat}
                                            </td>
                                            {Array.from({ length: 15 }).map((_, i) => {
                                                const val = localConfig.profiles[cat]?.[i] ?? 0;
                                                return (
                                                    <td key={i} className="px-1 py-1 border-r border-gray-100 p-0 h-full">
                                                        <input
                                                            type="number"
                                                            step="0.0001"
                                                            value={val}
                                                            onChange={(e) => handleCellChange(cat, i, e.target.value)}
                                                            className={`w-full h-full min-h-[44px] px-2 py-2 text-right focus:bg-blue-50 focus:outline-none text-xs font-medium transition-colors ${val < 0 ? 'text-red-700' : 'text-green-700'}`}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-2 bg-gray-50 text-[10px] text-gray-400 border-t border-gray-200 text-center">
                            Waarden zijn ratio's t.o.v. commitment (bijv. -0.5 = 50% call).
                        </div>
                    </div>

                    {/* Import Section */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <h3 className="text-sm font-bold text-gray-700 uppercase mb-3 flex items-center gap-2">
                            <FileSpreadsheet size={16} /> Importeer Fonds Data
                        </h3>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer transition-colors text-xs font-bold uppercase border border-gray-300">
                                <Upload size={14} />
                                Kies Excel Bestand
                                <input
                                    type="file"
                                    accept=".xlsx"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </label>
                            {importMsg && (
                                <span className={`text-xs font-medium ${importMsg.includes('Succes') ? 'text-green-600' : 'text-gray-500'}`}>
                                    {importMsg}
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-[10px] text-gray-400">
                            Upload een 'Capital Calls & Distributions' bestand om de J-Curves automatisch bij te werken.
                        </p>
                    </div>

                    {/* Section for Rules? Keeping it read-only or simple for now as requested tables focus on profiles */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <h3 className="text-sm font-bold text-gray-700 uppercase mb-2">Notificaties</h3>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email voor alerts</label>
                        <input
                            type="email"
                            value={localConfig.notificationEmail || ''}
                            onChange={e => setLocalConfig({ ...localConfig, notificationEmail: e.target.value })}
                            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded text-sm"
                            placeholder="naam@bedrijf.nl"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex justify-between bg-white rounded-b-xl items-center">
                    <button onClick={handleReset} className="text-red-600 text-xs font-bold hover:underline flex items-center gap-2 uppercase tracking-wide">
                        <RefreshCw size={12} /> Reset Data
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-500 font-bold text-xs uppercase hover:bg-gray-100 rounded-lg transition-colors">
                            Annuleren
                        </button>
                        <button onClick={handleSave} className="px-6 py-2 bg-[#C5A572] hover:bg-[#b09363] text-white font-bold text-xs uppercase rounded-lg shadow-md transition-all flex items-center gap-2">
                            <Save size={14} /> Opslaan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
