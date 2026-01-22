// 1. Cashflow Profiles (Netto Cashflow Factoren)
export const DEFAULT_CASHFLOW_PROFILES = {
    secondaries: [
        -0.5323, -0.0477, 0.2549, 0.2097, 0.1454,
        0.0819, 0.0920, 0.0760, 0.0527, 0.0082, 0.0036, 0.0
    ],
    pe: [
        -0.3146, -0.2186, -0.2186, -0.0981, 0.2536,
        0.4186, 0.4171, 0.2514, 0.1469, 0.1402, 0.0416, 0.0
    ],
    vc: [
        -0.0712, -0.0834, -0.3393, -0.2871, -0.0690,
        0.1005, 0.3004, 0.5594, 0.4080, 0.2948, 0.1330, 0.0
    ]
};

// 2. Default Notification Email
export const DEFAULT_NOTIFICATION_EMAIL = "compliance@momentum.nl";

// 3. Allocation Rules
export const DEFAULT_ALLOCATION_RULES = {
    phase1: { // Years 1-5
        years: [1, 2, 3, 4, 5],
        ratios: { secondaries: 0.70, pe: 0.30, vc: 0.00 },
        ranges: {
            secondaries: [0.70, 0.80],
            pe: [0.20, 0.30],
            vc: [0.00, 0.10]
        }
    },
    phase2: { // Years 6-10
        years: [6, 7, 8, 9, 10],
        ratios: { secondaries: 0.40, pe: 0.40, vc: 0.20 },
        ranges: {
            secondaries: [0.30, 0.50],
            pe: [0.30, 0.50],
            vc: [0.10, 0.20]
        }
    },
    phase3: { // Years 10+
        years: [11, 12, 13, 14, 15],
        ratios: { secondaries: 0.30, pe: 0.50, vc: 0.20 },
        ranges: { // No ranges specified for phase 3, assuming strict or same behavior
            secondaries: [0.30, 0.30],
            pe: [0.50, 0.50],
            vc: [0.20, 0.20]
        }
    }
};

// 4. Net Position Profiles (Netto positie t.o.v. commitment)
export const NET_POSITION_PROFILES = {
    secondaries: [
        -0.5310, -0.5786, -0.2760, -0.0271, 0.1579,
        0.2889, 0.4360, 0.5575, 0.6418, 0.6549, 0.6606
    ],
    pe: [
        -0.2950, -0.5000, -0.7050, -0.7970, -0.5680,
        -0.1900, 0.2470, 0.5430, 0.7160, 0.8810, 0.9300
    ],
    vc: [
        -0.0555, -0.1205, -0.3850, -0.6088, -0.6626,
        -0.5581, -0.2456, 0.3762, 0.9482, 1.3615, 1.5480
    ]
};

// Helper to get data with local storage overrides
export const getConfiguration = () => {
    const saved = localStorage.getItem('cpt_v2_config');
    if (saved) {
        return JSON.parse(saved);
    }
    return {
        profiles: DEFAULT_CASHFLOW_PROFILES,
        rules: DEFAULT_ALLOCATION_RULES,
        netPositions: NET_POSITION_PROFILES,
        notificationEmail: DEFAULT_NOTIFICATION_EMAIL
    };
};

export const saveConfiguration = (config) => {
    localStorage.setItem('cpt_v2_config', JSON.stringify(config));
};

export const resetConfiguration = () => {
    localStorage.removeItem('cpt_v2_config');
    return {
        profiles: DEFAULT_CASHFLOW_PROFILES,
        rules: DEFAULT_ALLOCATION_RULES,
        netPositions: NET_POSITION_PROFILES,
        notificationEmail: DEFAULT_NOTIFICATION_EMAIL
    };
};
