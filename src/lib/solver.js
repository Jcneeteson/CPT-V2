import { DEFAULT_CASHFLOW_PROFILES, DEFAULT_ALLOCATION_RULES, NET_POSITION_PROFILES } from '../config/dummyData.js';

/**
 * Calculates the cashflow effect of a commitment over time.
 * @param {number} commitmentAmount - The amount committed.
 * @param {Array<number>} profile - The cashflow profile (percentages).
 * @param {number} startYearIndex - The year index (0-based) relative to the start of the simulation.
 * @param {number} horizon - Total duration of the simulation in years (projection horizon).
 * @returns {object} { cashflows: Array<number>, unfunded: Array<number> }
 */
function calculateCommitmentProjection(commitmentAmount, profile, startYearIndex, horizon) {
    const cashflows = new Array(horizon).fill(0);
    const unfunded = new Array(horizon).fill(0);

    let cumulativeCalled = 0;

    for (let i = 0; i < horizon; i++) {
        const yearIndex = startYearIndex + i; // Global year index
        // Profile index is i (0 = year 1 of commitment, 1 = year 2, etc.)

        if (yearIndex < horizon) {
            if (i < profile.length) {
                // Cashflow (positive = distribution, negative = call)
                // Profile values: negative means call, positive means distribution
                const flow = commitmentAmount * profile[i];
                cashflows[yearIndex] = flow;

                // Track called capital to determine unfunded
                // Note: Profile usually mixes capital calls and distributions. 
                // A pure "Call" profile is needed for accurate Unfunded calc.
                // WE APPROXIMATE: Any negative flow is a call.
                if (profile[i] < 0) {
                    cumulativeCalled += Math.abs(flow);
                }
            }
            // Unfunded at END of yearIndex
            // If we assume commitment amount is the "Total Cap"
            // Unfunded = max(0, Commitment - CumulativeCalled)
            unfunded[yearIndex] = Math.max(0, commitmentAmount - cumulativeCalled);
        }
    }

    // Fill remaining years if profile is shorter than horizon
    for (let t = startYearIndex + profile.length; t < horizon; t++) {
        unfunded[t] = Math.max(0, commitmentAmount - cumulativeCalled);
    }

    // Fill previous years with 0 (didn't exist yet)
    // Actually unfunded starts when committed. Before that 0.

    return { cashflows, unfunded };
}

/**
 * Solves the commitment plan.
 * @param {object} params
 * @param {number} params.availableCapital - Total starting capital.
 * @param {number} params.startYear - e.g. 2026.
 * @param {number} params.horizon - Legacy parameter for investment duration (now planningHorizon).
 * @param {number} params.planningHorizon - Number of years to actively make new commitments.
 * @param {number} params.projectionHorizon - Total number of years to simulate (default 50).
 * @param {object} params.config - Profiles and Rules.
 * @param {object} params.selectedCategories - { secondaries: true, pe: true, vc: true }.
 * @param {number} params.maxYearlyChange - Percentage (0.0 - 1.0, default 0.2).
 * @param {number} params.firstYearCap - Percentage of AvailCap (0.0 - 1.0, default 0.25).
 */
export function solveCPT({ availableCapital, startYear, horizon, planningHorizon, projectionHorizon = 50, config, selectedCategories, maxYearlyChange = 0.2, firstYearCap = 0.25 }) {
    const profiles = config?.profiles || DEFAULT_CASHFLOW_PROFILES;
    const rules = config?.rules || DEFAULT_ALLOCATION_RULES;

    // Determine horizons
    // If planningHorizon is not explicitly provided, use the old 'horizon' param.
    // If neither, default to 15.
    const pHorizon = planningHorizon || horizon || 15;

    // Ensure projection is at least as long as planning
    const totalHorizon = Math.max(pHorizon, projectionHorizon);

    // --- Helper: Run the Solver Core Logic ---
    // We wrap this to allow retrying with relaxed constraints
    const runSolver = (smoothingEnabled) => {
        // Arrays sized to TOTAL projection horizon
        const currentProjectedCashflows = new Array(totalHorizon).fill(0);
        const currentProjectedUnfunded = new Array(totalHorizon).fill(0);

        // Accumulators for global state
        const commitments = [];

        // Track last year's total commitment for smoothing
        let lastYearCommitment = 0;

        // LOOP 1: Planning Phase (Making Commitments)
        // We only iterate up to pHorizon to make decisions
        for (let yearIdx = 0; yearIdx < pHorizon; yearIdx++) {
            const currentYear = startYear + yearIdx;
            const yearNum = yearIdx + 1;

            // 1. Determine Ratios
            let phase = 'phase3';
            if (yearNum <= 5) phase = 'phase1';
            else if (yearNum <= 10) phase = 'phase2';

            const phaseRules = rules[phase];
            const rawRatios = { ...phaseRules.ratios };
            let ratioSum = 0;
            if (selectedCategories.secondaries) ratioSum += rawRatios.secondaries;
            if (selectedCategories.pe) ratioSum += rawRatios.pe;
            if (selectedCategories.vc) ratioSum += rawRatios.vc;

            const ratios = { secondaries: 0, pe: 0, vc: 0 };
            if (ratioSum > 0) {
                if (selectedCategories.secondaries) ratios.secondaries = rawRatios.secondaries / ratioSum;
                if (selectedCategories.pe) ratios.pe = rawRatios.pe / ratioSum;
                if (selectedCategories.vc) ratios.vc = rawRatios.vc / ratioSum;
            }

            // 2. Define Feasibility Check
            // We need to commit amount C such that for ALL t >= yearIdx (up to totalHorizon):
            // CashBalance[t] >= Unfunded[t] (Strict Liquidity: 100% Cash Backed)

            const isFeasible = (amount) => {
                // Distribute amount
                const breakdowns = {
                    secondaries: amount * ratios.secondaries,
                    pe: amount * ratios.pe,
                    vc: amount * ratios.vc
                };

                const newFlows = new Array(totalHorizon).fill(0);
                const newUnfunded = new Array(totalHorizon).fill(0);

                // Calculate impact of NEW commitment
                ['secondaries', 'pe', 'vc'].forEach(cat => {
                    if (breakdowns[cat] > 0) {
                        const proj = calculateCommitmentProjection(breakdowns[cat], profiles[cat], yearIdx, totalHorizon);
                        for (let t = 0; t < totalHorizon; t++) {
                            newFlows[t] += proj.cashflows[t];
                            newUnfunded[t] += proj.unfunded[t];
                        }
                    }
                });

                // Check Future Integrity (Full Projection)
                let runningBalance = availableCapital; // Start T=0

                for (let t = 0; t < totalHorizon; t++) {
                    // Update running balance with established flows ONLY
                    runningBalance += currentProjectedCashflows[t];
                    // Add NEW flow
                    runningBalance += newFlows[t];

                    if (t >= yearIdx) {
                        const totalUnfunded = currentProjectedUnfunded[t] + newUnfunded[t];

                        if (runningBalance < totalUnfunded) {
                            return false;
                        }

                        // Also basic sanity: Cash shouldn't be negative just from calls
                        if (runningBalance < 0) return false;
                    }
                }
                return true;
            };

            // 3. Define Bounds based on Smoothing
            let maxCommitment = availableCapital * 2; // Theoretical max

            if (smoothingEnabled) {
                if (yearIdx === 0) {
                    // Year 1 Cap
                    maxCommitment = availableCapital * firstYearCap;
                } else {
                    // Year > 1
                    // Allow restart if we dropped to 0: Max of (LastYear + Growth) OR (5% of AvailableCapital)
                    const growthCap = lastYearCommitment * (1 + maxYearlyChange);
                    const restartFloor = availableCapital * 0.05;
                    maxCommitment = Math.max(growthCap, restartFloor);
                }
            }

            // Hard Cap for safety (avoid infinite loops)
            maxCommitment = Math.min(maxCommitment, availableCapital * 5);


            // 4. Binary Search for Optimal
            let low = 0;
            let high = maxCommitment;
            let optimal = 0;

            for (let iter = 0; iter < 20; iter++) {
                const mid = (low + high) / 2;
                if (isFeasible(mid)) {
                    optimal = mid;
                    low = mid;
                } else {
                    high = mid;
                }
            }

            // Round to nearest 1k
            optimal = Math.floor(optimal / 1000) * 1000;

            // 5. Store & Update State
            const breakdown = {
                secondaries: optimal * ratios.secondaries,
                pe: optimal * ratios.pe,
                vc: optimal * ratios.vc
            };

            commitments.push({
                year: currentYear,
                amount: optimal,
                breakdown,
                ratios: { ...ratios },
                phase
            });

            lastYearCommitment = optimal;

            // Update Global Projections
            if (optimal > 0) {
                ['secondaries', 'pe', 'vc'].forEach(cat => {
                    if (breakdown[cat] > 0) {
                        const proj = calculateCommitmentProjection(breakdown[cat], profiles[cat], yearIdx, totalHorizon);
                        for (let t = 0; t < totalHorizon; t++) {
                            currentProjectedCashflows[t] += proj.cashflows[t];
                            currentProjectedUnfunded[t] += proj.unfunded[t];
                        }
                    }
                });
            }
        } // End Planning Loop

        // Post-Calculation Report (Full Projection)
        let runningMult = availableCapital;
        const annualReport = [];
        for (let t = 0; t < totalHorizon; t++) {
            const netFlow = currentProjectedCashflows[t];
            runningMult += netFlow;

            // Determine committed amount for this year (if within planning horizon)
            const committedAmount = t < pHorizon && commitments[t] ? commitments[t].amount : 0;
            const committedBreakdown = t < pHorizon && commitments[t] ? commitments[t].breakdown : { secondaries: 0, pe: 0, vc: 0 };

            annualReport.push({
                year: startYear + t,
                netCashflow: netFlow,
                endBalance: runningMult,
                totalCommitted: committedAmount,
                unfunded: currentProjectedUnfunded[t],
                // Per Category Committed
                breakdown: committedBreakdown
            });
        }

        return { commitments, annualReport, totalHorizon };
    };

    // --- Execution Strategy ---
    // 1. Try with Smoothing
    let result = runSolver(true);
    let relaxed = false;

    // 2. Check if we failed to deploy capital effectively?
    // Heuristic: If TotalCommitted < 50% of AvailableCapital in pHorizon, and we have Smoothing ON...
    const totalComm = result.commitments.reduce((sum, c) => sum + c.amount, 0);

    // Check cash at end of PLANNING horizon (not projection end, as cash might grow later)
    // Actually, check end of pHorizon.
    const checkIdx = Math.min(pHorizon - 1, result.annualReport.length - 1);
    const balanceAtPlanEnd = result.annualReport[checkIdx].endBalance;

    if (balanceAtPlanEnd > availableCapital * 0.1 && totalComm < availableCapital * 0.8) {
        // Try Relaxed
        const relaxedResult = runSolver(false); // Disable smoothing
        const relaxedTotal = relaxedResult.commitments.reduce((acc, c) => acc + c.amount, 0);

        if (relaxedTotal > totalComm * 1.2) {
            result = relaxedResult;
            relaxed = true;
        }
    }

    // --- Metrics & MOIC/IRR ---
    const calculateMetrics = (profile) => {
        let distributions = 0;
        let calls = 0;
        profile.forEach(p => {
            if (p > 0) distributions += p;
            if (p < 0) calls += Math.abs(p);
        });
        return calls === 0 ? 0 : distributions / calls;
    };

    const netPositions = config?.netPositions || NET_POSITION_PROFILES;

    const catMetrics = {
        secondaries: { moic: calculateMetrics(profiles.secondaries) },
        pe: { moic: calculateMetrics(profiles.pe) },
        vc: { moic: calculateMetrics(profiles.vc) }
    };

    // Calculate Portfolio Level Metrics
    let totalCalls = 0;
    let totalDistributions = 0;
    let breakEvenYear = null;

    let cumCalls = 0;
    let cumDist = 0;

    result.annualReport.forEach((r, idx) => {
        let yearCalls = 0;
        let yearDist = 0;
        let trueNav = 0;

        // Iterate all commitments made
        result.commitments.forEach(c => {
            ['secondaries', 'pe', 'vc'].forEach(cat => {
                if (c.breakdown[cat] > 0) {
                    const prof = profiles[cat];
                    const npProf = netPositions[cat];
                    const age = r.year - c.year;

                    // Cashflow calc
                    if (age >= 0 && age < prof.length) {
                        const val = c.breakdown[cat] * prof[age];
                        if (val < 0) yearCalls += Math.abs(val);
                        else yearDist += val;
                    }

                    // NAV/Exposure calc
                    if (age >= 0 && age < npProf.length) {
                        trueNav += c.breakdown[cat] * npProf[age];
                    }
                }
            });
        });

        cumCalls += yearCalls;
        cumDist += yearDist;

        // Determine Break Even
        if (breakEvenYear === null && cumDist >= cumCalls) {
            breakEvenYear = r.year;
        }

        r.nav = trueNav;
        r.totalValue = r.endBalance + trueNav; // Cash + NAV
        r.investedCapital = trueNav; // Display NAV as the "Invested/Exposure" bar
        r.cumulativeCalls = cumCalls;
        r.cumulativeDistributions = cumDist;
    });

    totalCalls = cumCalls;
    totalDistributions = cumDist;

    // Use end of projection for final metrics
    const finalReportItem = result.annualReport[result.totalHorizon - 1];

    const portfolioMOIC = totalCalls > 0 ? (totalDistributions + finalReportItem.nav) / totalCalls : 0;

    return {
        commitments: result.commitments,
        annualReport: result.annualReport,
        metrics: {
            totalCommitted: result.commitments.reduce((acc, c) => acc + c.amount, 0),
            minCash: Math.min(...result.annualReport.map(a => a.endBalance)),
            maxCash: Math.max(...result.annualReport.map(a => a.endBalance)),
            isSmoothed: !relaxed,
            relaxedConstraint: relaxed,
            categoryMetrics: catMetrics,
            // New Metrics
            portfolioMOIC,
            breakEvenYear,
            finalNav: finalReportItem.nav,
            finalCash: finalReportItem.endBalance,
            finalTotalValue: finalReportItem.totalValue
        }
    };
}
