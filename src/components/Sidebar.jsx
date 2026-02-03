import React, { useState } from 'react';
import { Download, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react';
import { exportToExcel, downloadBlob } from '../lib/export';
import ExportModal from './ExportModal';
import logo from '../assets/logo.png';

const FormattedNumberInput = ({ value, onChange, className }) => {
    // Store the raw string value while editing to assume full control
    const [localVal, setLocalVal] = React.useState('');
    const [isFocused, setIsFocused] = React.useState(false);

    // Sync only when NOT focused to avoid overwriting user input
    React.useEffect(() => {
        if (!isFocused && value !== undefined && value !== null) {
            setLocalVal(new Intl.NumberFormat('nl-NL').format(value));
        }
    }, [value, isFocused]);

    const handleChange = (e) => {
        // Allow user to type whatever, we parse on blur
        // But better: restrict to valid characters if possible, or just let them type
        setLocalVal(e.target.value);
    };

    const handleFocus = () => {
        setIsFocused(true);
        // Show raw value for editing (remove dots, convert comma to dot for JS math if needed, but usually users type ints here)
        // Actually, just showing the number without thousands separators is best.
        if (value !== undefined && value !== null) {
            setLocalVal(String(value));
        }
    };

    const handleBlur = () => {
        setIsFocused(false);
        // Clean up input: remove dots (thousands), replace comma with dot (decimal)
        // Example: "10.000" -> "10000"
        // Example: "10000" -> "10000"
        // Example: "10,5" -> "10.5"
        const raw = localVal.replace(/\./g, '').replace(/,/g, '.');
        const num = parseFloat(raw);
        if (!isNaN(num)) {
            onChange(num);
            setLocalVal(new Intl.NumberFormat('nl-NL').format(num));
        } else {
            // Revert
            setLocalVal(new Intl.NumberFormat('nl-NL').format(value));
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    };

    return (
        <input
            type="text"
            value={localVal}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={className}
        />
    );
};

export default function Sidebar({ params, setParams, categories, setCategories, result }) {
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    const showWarning = !categories.secondaries || !categories.pe || !categories.vc;

    const handleExport = async (clientName) => {
        if (!result) {
            throw new Error('Geen plan beschikbaar om te exporteren.');
        }
        const { blob, filename } = await exportToExcel(result, params, clientName);
        downloadBlob(blob, filename);
    };

    return (
        <>
            <aside className="w-80 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0 z-10 overflow-y-auto">
                {/* Header / Logo */}
                <div className="pt-4 pb-2 px-4 border-b border-gray-100 bg-white flex flex-col items-center">
                    <img src={logo} alt="Momentum Family Office" className="w-full h-auto object-contain mb-1" />
                </div>

                <div className="flex-1 p-6 space-y-8">
                    {/* Section 1: Parameters */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <DollarSign size={14} /> Financiële Parameters
                        </h3>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Beschikbaar Kapitaal (€)</label>
                            <FormattedNumberInput
                                value={params.availableCapital}
                                onChange={(val) => setParams({ ...params, availableCapital: val })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Startjaar</label>
                                <select
                                    value={params.startYear}
                                    onChange={e => setParams({ ...params, startYear: Number(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                                >
                                    <option value={2024}>2024</option>
                                    <option value={2025}>2025</option>
                                    <option value={2026}>2026</option>
                                    <option value={2027}>2027</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Investeringsduur</label>
                                <select
                                    value={params.horizon}
                                    onChange={e => setParams({ ...params, horizon: Number(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                                >
                                    <option value={10}>10 Jaar</option>
                                    <option value={15}>15 Jaar</option>
                                    <option value={20}>20 Jaar</option>
                                    <option value={30}>30 Jaar</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Section 2: Strategy */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp size={14} /> Strategie & Mix
                        </h3>
                        <div className="space-y-2 bg-white p-3 rounded-md border border-gray-200">
                            {Object.keys(categories).map(cat => (
                                <label key={cat} className="flex items-center gap-3 p-1 cursor-pointer hover:bg-gray-50 rounded">
                                    <input
                                        type="checkbox"
                                        checked={categories[cat]}
                                        onChange={e => setCategories({ ...categories, [cat]: e.target.checked })}
                                        className="w-4 h-4 text-gray-900 rounded focus:ring-gray-900 border-gray-300"
                                    />
                                    <span className="capitalize text-sm font-medium text-gray-700">{cat === 'pe' ? 'Private Equity' : cat === 'vc' ? 'Venture Capital' : 'Secondaries'}</span>
                                </label>
                            ))}
                        </div>
                        {showWarning && (
                            <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-800 rounded-md text-xs leading-relaxed border border-amber-200">
                                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                <p>Afwijkend van standaard mix profiel.</p>
                            </div>
                        )}
                    </section>

                    {/* Section 3: Risk & Rules */}
                    <section className="space-y-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            Allocatie Regels
                        </h3>

                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-medium text-gray-700">Jaarlijkse Delta (Spreiding)</label>
                                <span className="text-xs font-bold text-gray-900">{(params.maxYearlyChange * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="1" step="0.05"
                                value={params.maxYearlyChange}
                                onChange={e => setParams({ ...params, maxYearlyChange: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-gray-900"
                            />
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                <span>Stabiel (0%)</span>
                                <span>Flexibel (100%)</span>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-medium text-gray-700">Start Allocatie Limit (Jaar 1)</label>
                                <span className="text-xs font-bold text-gray-900">{(params.firstYearCap * 100).toFixed(0)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0.1" max="1" step="0.05"
                                value={params.firstYearCap}
                                onChange={e => setParams({ ...params, firstYearCap: parseFloat(e.target.value) })}
                                className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-gray-900"
                            />
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 bg-white">
                    <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                    >
                        <Download size={16} />
                        <span>Export to Excel</span>
                    </button>
                    <div className="mt-3 text-center text-[10px] text-gray-400">
                        Momentum CPT v2.1
                    </div>
                </div>
            </aside>

            {/* Export Modal */}
            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExport}
            />
        </>
    );
}
