import React, { useState } from 'react';
import {
    ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Settings, Info } from 'lucide-react';

const KPICard = ({ label, value, subtext, highlight }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-full">
        <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</h3>
            <div className={`text-2xl font-bold truncate ${highlight ? 'text-[#C5A572]' : 'text-[#0B1E3D]'}`} title={value}>
                {value}
            </div>
        </div>
        {subtext && <div className="text-xs text-gray-400 mt-2 font-medium">{subtext}</div>}
    </div>
);

export default function Dashboard({ result, params, config, onOpenSettings, manualOverrides, setManualOverrides }) {
    const [chartHorizon, setChartHorizon] = useState(15);
    // Track editing state to prevent jitter
    const [editingCell, setEditingCell] = useState(null); // { yearIndex, category }
    // Y-Axis zoom control state
    const [yAxisMax, setYAxisMax] = useState(null); // null means auto
    // State for actively editing commitment input (stores raw string)
    const [editingInputValue, setEditingInputValue] = useState(null);

    // Sync chart horizon with investment horizon if investment horizon increases
    React.useEffect(() => {
        if (params?.horizon && params.horizon > chartHorizon) {
            setChartHorizon(params.horizon);
        }
    }, [params?.horizon, chartHorizon]);

    if (!result) return <div className="p-10 text-center text-gray-500">Laden...</div>;

    const { metrics, annualReport } = result;
    const profiles = config?.profiles || {}; // Safe access

    // Formatting Helpers
    const formatEuro = (val) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
    const formatCompact = (val) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', notation: "compact", maximumFractionDigits: 1 }).format(val);

    // Filter Data for Chart
    const chartData = annualReport.slice(0, chartHorizon);

    const handleOverrideChange = (yearIndex, category, value) => {
        const numVal = value === '' ? null : parseFloat(value);

        setManualOverrides(prev => {
            const next = { ...prev };
            if (!next[yearIndex]) next[yearIndex] = {};

            if (numVal === null || isNaN(numVal)) {
                delete next[yearIndex][category];
                if (Object.keys(next[yearIndex]).length === 0) delete next[yearIndex];
            } else {
                next[yearIndex][category] = numVal;
            }
            return next;
        });
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-gray-50">
            {/* Top Bar / Header for Main View */}
            <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-[#0B1E3D]">Commitment Planning Tool</h1>
                    <p className="text-xs text-gray-400 mt-0.5">Real-time Portfolio Simulation</p>
                </div>
                <div className="flex gap-4 items-center">
                    {Object.keys(manualOverrides || {}).length > 0 && (
                        <button
                            onClick={() => setManualOverrides({})}
                            className="text-xs text-red-500 font-bold hover:underline"
                        >
                            Verwijder alle handmatige aanpassingen
                        </button>
                    )}
                    <button
                        onClick={onOpenSettings}
                        className="p-2 text-gray-400 hover:text-[#0B1E3D] hover:bg-gray-100 rounded-lg transition-colors"
                        title="Geavanceerde Instellingen"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">

                {/* 1. KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <KPICard
                        label="Cumulatief Gecommitteerd"
                        value={formatCompact(metrics.totalCommitted)}
                        subtext={formatEuro(metrics.totalCommitted)}
                    />
                    <KPICard
                        label="Volledig Gecommitteerd"
                        value={metrics.fullyCommittedYear || "N/A"}
                        subtext="Jaar waarin startkapitaal 100% is toegewezen"
                    />
                    <KPICard
                        label="Eindwaarde Portefeuille"
                        value={formatCompact(metrics.finalTotalValue)}
                        subtext={formatEuro(metrics.finalTotalValue)}
                        highlight
                    />
                    <KPICard
                        label="Portfolio MOIC"
                        value={`${metrics.portfolioMOIC.toFixed(2)}x`}
                        subtext="Total Value / Total Calls"
                    />
                </div>

                {/* 2. Composed Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="font-bold text-[#0B1E3D]">Portfolio Projectie</h3>
                            <p className="text-[10px] text-gray-400">Visuele weergave van cash en exposure</p>
                        </div>
                        <div className="flex items-center gap-6">
                            {/* Y-Axis Zoom Slider */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Verticale Schaal:</span>
                                <input
                                    type="range"
                                    min="1000000"
                                    max="100000000"
                                    step="1000000"
                                    value={yAxisMax || 50000000}
                                    onChange={(e) => setYAxisMax(Number(e.target.value))}
                                    className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#C5A572]"
                                    title={`Max: €${((yAxisMax || 50000000) / 1000000).toFixed(0)}M`}
                                />
                                <span className="text-xs text-gray-500 w-12">€{((yAxisMax || 50000000) / 1000000).toFixed(0)}M</span>
                                <button
                                    onClick={() => setYAxisMax(null)}
                                    className="text-[10px] text-gray-400 hover:text-[#C5A572] font-medium"
                                    title="Reset naar auto"
                                >
                                    Auto
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Projectieduur:</span>
                                <select
                                    value={chartHorizon}
                                    onChange={(e) => setChartHorizon(Number(e.target.value))}
                                    className="text-xs border-gray-200 rounded-md text-gray-600 focus:ring-[#C5A572] focus:border-[#C5A572] bg-gray-50 px-2 py-1"
                                >
                                    <option value={5}>5 Jaar</option>
                                    <option value={10}>10 Jaar</option>
                                    <option value={15}>15 Jaar</option>
                                    <option value={20}>20 Jaar</option>
                                    <option value={25}>25 Jaar</option>
                                    <option value={30}>30 Jaar</option>
                                    <option value={40}>40 Jaar</option>
                                    <option value={50}>50 Jaar</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="h-[350px] w-full min-w-0">
                        {chartData && chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 20, right: 120, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} dy={10} />
                                    <YAxis
                                        tickFormatter={(val) => `€${(val / 1000000).toFixed(0)}m`}
                                        axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                        width={60}
                                        domain={[0, yAxisMax || 'auto']}
                                        allowDataOverflow={true}
                                    />
                                    <Tooltip
                                        formatter={(val) => formatEuro(val)}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                    />
                                    <Legend />

                                    <Bar dataKey="capitalCalled" stackId="a" name="Geïnvesteerd Kapitaal" fill="#0B1E3D" barSize={32} />
                                    <Bar dataKey="availableCash" stackId="a" name="Beschikbaar Kapitaal" fill="#9CA3AF" barSize={32} />
                                    <Line type="monotone" dataKey="totalValue" stroke="#C5A572" strokeWidth={3} dot={false} name="Totale Waarde (NAV + Cash)" />
                                    {/* Horizontal Reference Line for Available Capital */}
                                    <ReferenceLine
                                        y={params.availableCapital}
                                        stroke="#6B7280"
                                        strokeDasharray="5 5"
                                        strokeWidth={2}
                                        label={{
                                            value: `Startkapitaal: €${(params.availableCapital / 1000000).toFixed(1)}M`,
                                            position: 'right',
                                            fill: '#6B7280',
                                            fontSize: 11,
                                            offset: 10
                                        }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                Geen data beschikbaar voor de grafiek
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Matrix Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-[#0B1E3D]">Cashflow Matrix</h3>
                        <span className="text-xs text-gray-500 italic">Netto kasstroom projectie per jaar - Pas commitment aan om handmatig te sturen.</span>
                    </div>

                    {/* Added max-h-screen/2 to allow scrolling without going to bottom of page */}
                    <div className="overflow-auto relative max-h-[60vh]">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="text-xs text-gray-500 bg-gray-50 uppercase tracking-wider border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 sticky left-0 top-0 bg-gray-50 z-30 font-bold border-r border-gray-200 min-w-[150px]">Fondstype</th>
                                    <th className="px-2 py-3 sticky top-0 bg-gray-50 z-20 font-bold border-r border-gray-200">Curr.</th>
                                    <th className="px-4 py-3 sticky top-0 bg-gray-50 z-20 font-bold border-r border-gray-200 text-right w-32">Commitment</th>
                                    <th className="px-3 py-3 sticky top-0 bg-gray-50 z-20 font-bold border-r border-gray-200 text-center">IRR</th>
                                    <th className="px-3 py-3 sticky top-0 bg-gray-50 z-20 font-bold border-r border-gray-200 text-center">Instap</th>
                                    {annualReport.slice(0, chartHorizon).map(r => (
                                        <th key={r.year} className="px-3 py-3 sticky top-0 bg-gray-50 z-20 font-medium text-center border-r border-gray-100 last:border-0 min-w-[90px]">
                                            {r.year}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {result.commitments.map((comm, commIdx) => {
                                    // Expand each commitment into 3 potential rows (Sec, PE, VC)
                                    const types = [
                                        { key: 'secondaries', label: 'Secondaries', irr: '13.2%' },
                                        { key: 'pe', label: 'PE', irr: '14.7%' },
                                        { key: 'vc', label: 'VC', irr: '18.5%' }
                                    ];

                                    return types.map(type => {
                                        const amount = comm.breakdown[type.key];
                                        // If amount is 0 AND not manual override, skip
                                        // If it is manually overridden to 0, show it?
                                        const isManual = comm.isManual || (manualOverrides?.[commIdx]?.[type.key] !== undefined);
                                        if (amount <= 0 && !isManual) return null;

                                        return (
                                            <tr key={`${comm.year}-${type.key}`} className={`hover:bg-gray-50 transition-colors ${isManual ? 'bg-yellow-50' : ''}`}>
                                                <td className="px-4 py-2 font-medium text-[#0B1E3D] sticky left-0 bg-white z-10 border-r border-gray-200 truncate">
                                                    {type.label}
                                                </td>
                                                <td className="px-2 py-2 text-center text-gray-500 border-r border-gray-200">EUR</td>
                                                <td className="px-2 py-1 text-right text-gray-700 font-medium border-r border-gray-200 relative">
                                                    <input
                                                        type="text"
                                                        value={
                                                            editingCell?.yearIndex === commIdx && editingCell?.category === type.key
                                                                ? editingInputValue
                                                                : new Intl.NumberFormat('nl-NL').format(Math.round(amount / 1000) * 1000)
                                                        }
                                                        onFocus={() => {
                                                            setEditingCell({ yearIndex: commIdx, category: type.key });
                                                            setEditingInputValue(String(amount));
                                                        }}
                                                        onChange={(e) => {
                                                            // Allow only digits
                                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                                            setEditingInputValue(val);
                                                        }}
                                                        onBlur={() => {
                                                            const numVal = editingInputValue === '' ? 0 : parseInt(editingInputValue, 10);
                                                            const rounded = Math.round(numVal / 1000) * 1000;
                                                            handleOverrideChange(commIdx, type.key, String(rounded));
                                                            setEditingCell(null);
                                                            setEditingInputValue(null);
                                                        }}
                                                        className={`w-28 px-2 py-1 text-right border border-transparent hover:border-gray-300 focus:border-[#C5A572] focus:ring-1 focus:ring-[#C5A572] rounded text-sm bg-transparent font-medium
                                                            ${isManual ? 'text-[#C5A572] font-bold' : ''}`}
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-center text-gray-500 border-r border-gray-200">{type.irr}</td>
                                                <td className="px-3 py-2 text-center text-gray-500 border-r border-gray-200">{comm.year}</td>

                                                {annualReport.slice(0, chartHorizon).map(r => {
                                                    const idx = r.year - comm.year;
                                                    const profile = profiles[type.key] || [];

                                                    let flow = 0;
                                                    if (idx >= 0 && idx < profile.length) {
                                                        flow = amount * profile[idx];
                                                    }

                                                    const isZero = Math.abs(flow) < 1;
                                                    const isNegative = flow < 0;

                                                    return (
                                                        <td key={r.year} className={`px-2 py-2 text-right border-r border-gray-100 text-xs ${isZero ? 'text-gray-300' : isNegative ? 'text-red-600' : 'text-green-600'}`}>
                                                            {isZero ? '-' : new Intl.NumberFormat('nl-NL').format(Math.round(flow))}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    });
                                })}

                                {/* Spacer Row */}
                                <tr className="h-4 bg-gray-50 border-t border-b border-gray-200">
                                    <td colSpan={5 + chartHorizon} className="sticky left-0 bg-gray-50 z-10"></td>
                                </tr>

                                {/* Summary Rows (Bottom Fixed style) */}
                                {/* 1. Available Capital (can be used for new investments) */}
                                <tr className="bg-[#EFF6FF] border-b border-blue-100 font-medium text-xs">
                                    <td colSpan={5} className="px-4 py-3 sticky left-0 bg-[#EFF6FF] z-10 border-r border-blue-200 text-[#0B1E3D] font-bold">
                                        Beschikbaar Kapitaal
                                    </td>
                                    {annualReport.slice(0, chartHorizon).map(r => (
                                        <td key={r.year} className="px-2 py-3 text-right border-r border-blue-100 text-blue-900">
                                            {formatEuro(r.availableCash)}
                                        </td>
                                    ))}
                                </tr>

                                {/* 2. Net Cashflow */}
                                <tr className="bg-[#EFF6FF] border-b border-blue-100 font-medium text-xs">
                                    <td colSpan={5} className="px-4 py-3 sticky left-0 bg-[#EFF6FF] z-10 border-r border-blue-200 text-[#0B1E3D] font-bold">
                                        Jaarlijkse Netto Cashflow
                                    </td>
                                    {annualReport.slice(0, chartHorizon).map(r => (
                                        <td key={r.year} className={`px-2 py-3 text-right border-r border-blue-100 ${r.netCashflow < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {new Intl.NumberFormat('nl-NL').format(Math.round(r.netCashflow))}
                                        </td>
                                    ))}
                                </tr>

                                {/* 3. Capital Called (Actual money invested in funds) */}
                                <tr className="bg-[#0B1E3D] text-white text-xs font-medium">
                                    <td colSpan={5} className="px-4 py-3 sticky left-0 bg-[#0B1E3D] z-10 border-r border-gray-700 font-bold">
                                        Geïnvesteerd Kapitaal (Capital Called)
                                    </td>
                                    {annualReport.slice(0, chartHorizon).map(r => (
                                        <td key={r.year} className="px-2 py-3 text-right border-r border-gray-700 text-gray-200">
                                            {formatEuro(r.capitalCalled)}
                                        </td>
                                    ))}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}


