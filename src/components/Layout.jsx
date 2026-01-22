import React from 'react';

export default function Layout({ sidebar, main }) {
    return (
        <div className="flex flex-row h-screen w-screen overflow-hidden bg-gray-50">
            {/* Sidebar Container */}
            <div className="flex-shrink-0 w-80 relative z-20 shadow-xl">
                {sidebar}
            </div>

            {/* Main Content Container */}
            <main className="flex-1 relative z-10 overflow-hidden flex flex-col min-w-0">
                {main}
            </main>
        </div>
    );
}
