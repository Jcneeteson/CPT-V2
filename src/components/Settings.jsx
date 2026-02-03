import React, { useState } from 'react';
import { Save, RefreshCw, AlertTriangle, Mail } from 'lucide-react';
import { resetConfiguration } from '../config/dummyData';

export default function Settings({ config, onConfigChange }) {
    // Local state for editing before save
    const [localProfiles, setLocalProfiles] = useState(JSON.stringify(config.profiles, null, 2));
    const [localRules, setLocalRules] = useState(JSON.stringify(config.rules, null, 2));
    const [localEmail, setLocalEmail] = useState(config.notificationEmail || '');
    const [error, setError] = useState(null);

    const handleSave = () => {
        try {
            const parsedProfiles = JSON.parse(localProfiles);
            const parsedRules = JSON.parse(localRules);

            onConfigChange({
                profiles: parsedProfiles,
                rules: parsedRules,
                notificationEmail: localEmail
            });
            setError(null);
            alert('Configuratie succesvol opgeslagen!');
        } catch {
            setError('Ongeldig JSON formaat. Controleer uw syntax.');
        }
    };

    const handleReset = () => {
        if (confirm('Weet u zeker dat u de standaardwaarden wilt herstellen? Dit kan niet ongedaan worden gemaakt.')) {
            const defaults = resetConfiguration();
            onConfigChange(defaults);
            setLocalProfiles(JSON.stringify(defaults.profiles, null, 2));
            setLocalRules(JSON.stringify(defaults.rules, null, 2));
            setLocalEmail(defaults.notificationEmail);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Configuratie</h2>
                    <p className="text-gray-500 text-sm mt-1">Beheer cashflow profielen, allocatieregels en meldingen.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors"
                    >
                        <RefreshCw size={16} />
                        Herstel Standaardwaarden
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
                    >
                        <Save size={16} />
                        Wijzigingen Opslaan
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <AlertTriangle size={18} />
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {/* Email Setting */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="max-w-md">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Mail size={16} className="text-blue-500" /> Notificaties
                    </h3>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notificatie Email</label>
                    <input
                        type="email"
                        value={localEmail}
                        onChange={(e) => setLocalEmail(e.target.value)}
                        placeholder="compliance@momentum.nl"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <p className="mt-1 text-[10px] text-gray-400">Dit adres ontvangt een bericht wanneer er wordt afgeweken van de standaard mix.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cashflow Profiles Editor */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-semibold text-gray-900">Cashflow Profielen</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Bewerk de J-Curve arrays voor elke categorie.</p>
                    </div>
                    <div className="p-0">
                        <textarea
                            value={localProfiles}
                            onChange={(e) => setLocalProfiles(e.target.value)}
                            className="w-full h-[400px] p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/20"
                        />
                    </div>
                </div>

                {/* Allocation Rules Editor */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h3 className="font-semibold text-gray-900">Allocatie Regels</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Definieer fases, ratio's en bandbreedtes.</p>
                    </div>
                    <div className="p-0">
                        <textarea
                            value={localRules}
                            onChange={(e) => setLocalRules(e.target.value)}
                            className="w-full h-[400px] p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/20"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
