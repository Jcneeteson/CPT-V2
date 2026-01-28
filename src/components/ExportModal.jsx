import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function ExportModal({ isOpen, onClose, onExport }) {
    const [clientName, setClientName] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setClientName('');
            setIsExporting(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!clientName.trim()) return;

        setIsExporting(true);
        try {
            await onExport(clientName.trim());
            onClose();
        } catch (err) {
            console.error(err);
            alert('Fout bij exporteren: ' + err.message);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-bold text-[#0B1E3D]">Export naar Excel</h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Naam van de klant
                        </label>
                        <input
                            type="text"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            placeholder="Voer klantnaam in..."
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C5A572] focus:border-[#C5A572] text-sm transition-colors"
                            autoFocus
                        />
                        <p className="mt-2 text-xs text-gray-500">
                            De klantnaam wordt gebruikt in de bestandsnaam van het Excel bestand.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            Annuleren
                        </button>
                        <button
                            type="submit"
                            disabled={!clientName.trim() || isExporting}
                            className="flex-1 px-4 py-3 bg-[#0B1E3D] text-white rounded-lg text-sm font-bold hover:bg-[#0B1E3D]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? 'Exporteren...' : 'Exporteren'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
