import React, { useState } from 'react';
import {
    ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Settings, Info } from 'lucide-react';

const KPICard = ({ label, value, subtext, highlight }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-full">
        <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</h3>
            <div className={`text-2xl font-bold ${highlight ? 'text-[#C5A572]' : 'text-[#0B1E3D]'}`}>
                {value}
            </div>
        </div>
        {subtext && <div className="text-xs text-gray-400 mt-2 font-medium">{subtext}</div>}
    </div>
);

export default function Dashboard({ result, params, config, onOpenSettings }) {
    const [chartHorizon, setChartHorizon] = useState(15);

    // Sync chart horizon with investment horizon if investment horizon increases
    React.useEffect(() => {
        if (params?.horizon && params.horizon > chartHorizon) {
            setChartHorizon(params.horizon);
        }
    }, [params?.horizon]);

    if (!result) return <div className="p-10 text-center text-gray-500">Laden...</div>;

    const { metrics, annualReport } = result;
    const profiles = config?.profiles || {}; // Safe access

    // Formatting Helpers
    const formatEuro = (val) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
    const formatPercent = (val) => new Intl.NumberFormat('nl-NL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val);

    // Filter Data for Chart
    const chartData = annualReport.slice(0, chartHorizon);

    return (
        <div className="h-full flex flex-col overflow-hidden bg-gray-50">
            {/* Top Bar / Header for Main View */}
            <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-[#0B1E3D]">Control Room</h1>
                    <p className="text-xs text-gray-400 mt-0.5">Real-time Portfolio Simulation</p>
                </div>
                <button
                    onClick={onOpenSettings}
                    className="p-2 text-gray-400 hover:text-[#0B1E3D] hover:bg-gray-100 rounded-lg transition-colors"
                    title="Geavanceerde Instellingen"
                >
                    <Settings size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">

                {/* 1. KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <KPICard
                        label="Totaal Gecommitteerd"
                        value={formatEuro(metrics.totalCommitted)}
                    />
                    <KPICard
                        label="Break-even Jaar"
                        value={metrics.breakEvenYear || "N/A"}
                        subtext="Cumulatieve Distributies > Calls"
                    />
                    <KPICard
                        label="Eindwaarde Portefeuille"
                        value={formatEuro(metrics.finalTotalValue)}
                        subtext="Cash + Net Asset Value"
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

                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} dy={10} />
                                <YAxis
                                    tickFormatter={(val) => `€${(val / 1000000).toFixed(0)}m`}
                                    axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                    width={60}
                                />
                                <Tooltip
                                    formatter={(val) => formatEuro(val)}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                />
                                <Legend />

                                <Bar dataKey="investedCapital" stackId="a" name="Geïnvesteerd (Exposure)" fill="#0B1E3D" barSize={32} />
                                <Bar dataKey="endBalance" stackId="a" name="Beschikbare Cash" fill="#9CA3AF" barSize={32} />
                                <Line type="monotone" dataKey="totalValue" stroke="#C5A572" strokeWidth={3} dot={false} name="Totale Waarde (NAV + Cash)" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Matrix Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <h3 className="font-bold text-[#0B1E3D]">Cashflow Matrix</h3>
                        <span className="text-xs text-gray-500 italic">Netto kasstroom projectie per jaar</span>
                    </div>

                    {/* Added max-h-screen/2 to allow scrolling without going to bottom of page */}
                    <div className="overflow-auto relative max-h-[60vh]">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="text-xs text-gray-500 bg-gray-50 uppercase tracking-wider border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 sticky left-0 top-0 bg-gray-50 z-30 font-bold border-r border-gray-200 min-w-[150px]">Fondstype</th>
                                    <th className="px-2 py-3 sticky top-0 bg-gray-50 z-20 font-bold border-r border-gray-200">Curr.</th>
                                    <th className="px-4 py-3 sticky top-0 bg-gray-50 z-20 font-bold border-r border-gray-200 text-right">Commitment</th>
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
                                        if (amount <= 0) return null; // Skip if no allocation

                                        return (
                                            <tr key={`${comm.year}-${type.key}`} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-2 font-medium text-[#0B1E3D] sticky left-0 bg-white z-10 border-r border-gray-200 truncate">
                                                    {type.label}
                                                </td>
                                                <td className="px-2 py-2 text-center text-gray-500 border-r border-gray-200">EUR</td>
                                                <td className="px-4 py-2 text-right text-gray-700 font-medium border-r border-gray-200">
                                                    {formatEuro(amount)}
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
                                {/* 1. Cumulative Cash Flow */}
                                <tr className="bg-[#EFF6FF] border-b border-blue-100 font-medium text-xs">
                                    <td colSpan={5} className="px-4 py-3 sticky left-0 bg-[#EFF6FF] z-10 border-r border-blue-200 text-[#0B1E3D] font-bold">
                                        Cumulative Cash Flow (Eindbalans)
                                    </td>
                                    {annualReport.slice(0, chartHorizon).map(r => (
                                        <td key={r.year} className="px-2 py-3 text-right border-r border-blue-100 text-blue-900">
                                            {formatEuro(r.endBalance)}
                                        </td>
                                    ))}
                                </tr>

                                {/* 2. Net Cashflow */}
                                <tr className="bg-[#EFF6FF] border-b border-blue-100 font-medium text-xs">
                                    <td colSpan={5} className="px-4 py-3 sticky left-0 bg-[#EFF6FF] z-10 border-r border-blue-200 text-[#0B1E3D] font-bold">
                                        Annual Net Cashflow
                                    </td>
                                    {annualReport.slice(0, chartHorizon).map(r => (
                                        <td key={r.year} className={`px-2 py-3 text-right border-r border-blue-100 ${r.netCashflow < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {new Intl.NumberFormat('nl-NL').format(Math.round(r.netCashflow))}
                                        </td>
                                    ))}
                                </tr>

                                {/* 3. Cash Exposure (Invested Capital) */}
                                <tr className="bg-[#0B1E3D] text-white text-xs font-medium">
                                    <td colSpan={5} className="px-4 py-3 sticky left-0 bg-[#0B1E3D] z-10 border-r border-gray-700 font-bold">
                                        Cash Exposure (Geïnvesteerd Vermogen)
                                    </td>
                                    {annualReport.slice(0, chartHorizon).map(r => (
                                        <td key={r.year} className="px-2 py-3 text-right border-r border-gray-700 text-gray-200">
                                            {formatEuro(r.investedCapital)}
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


