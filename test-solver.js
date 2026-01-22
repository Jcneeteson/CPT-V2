import { solveCPT } from './src/lib/solver.js';
import { DEFAULT_CASHFLOW_PROFILES, DEFAULT_ALLOCATION_RULES } from './src/config/dummyData.js';

// Mock Config
const config = {
    profiles: DEFAULT_CASHFLOW_PROFILES,
    rules: DEFAULT_ALLOCATION_RULES
};

// Test Case 1: Standard Run
console.log("Running Solver Test...");
const result = solveCPT({
    availableCapital: 10000000,
    startYear: 2026,
    horizon: 15,
    config: config,
    selectedCategories: { secondaries: true, pe: true, vc: true }
});

// Checks
let passed = true;
let minCash = Infinity;

result.annualReport.forEach(r => {
    if (r.endBalance < -1) { // -1 for floating point tolerance
        console.error(`FAIL: Negative balance in year ${r.year}: ${r.endBalance}`);
        passed = false;
    }
    if (r.endBalance < minCash) minCash = r.endBalance;
});

if (passed) {
    console.log("PASS: No negative balances found.");
    console.log(`Min Balance: ${minCash}`);
    console.log(`Total Committed: ${result.metrics.totalCommitted}`);
    console.log(`Commitment Plan:`);
    console.table(result.commitments.map(c => ({
        Year: c.year,
        Amount: c.amount,
        EndBalance: result.annualReport.find(r => r.year === c.year).endBalance,
        Sec: c.breakdown.secondaries.toFixed(0),
        PE: c.breakdown.pe.toFixed(0),
        VC: c.breakdown.vc.toFixed(0)
    })));
} else {
    console.log("FAIL: Solver produced negative balances.");
}
