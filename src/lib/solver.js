import { DEFAULT_CASHFLOW_PROFILES, DEFAULT_ALLOCATION_RULES, NET_POSITION_PROFILES, NAV_PROFILES } from '../config/dummyData.js';

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
export function solveCPT({ availableCapital, startYear, horizon, planningHorizon, projectionHorizon = 50, config, selectedCategories, maxYearlyChange = 0.2, firstYearCap = 0.25, manualOverrides }) {
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

            // Check for Manual Overrides (NEW)
            // manualOverrides structure: { [yearIndex]: { secondaries: val, pe: val, vc: val } }
            // or we pass it as { [year]: ... }? Better yearIndex for array alignment, but year for stability.
            // Let's assume yearIndex 0-based relative to startYear.

            const overrides = manualOverrides?.[yearIdx];

            let optimal = 0;
            let breakdown = { secondaries: 0, pe: 0, vc: 0 };
            let isManual = false;

            // If we have ANY override for this year, we treat this year as "Manually Directed" to some extent.
            // Simplified logic: If an override exists for a category, use it. 
            // For non-overridden categories, what do we do?
            // Option A: If any override exists, ONLY use overrides (don't auto-fill others).
            // Option B: Optimizer fills the rest. (Complex: constraints change).
            // User request: "Adjust commitment manually in matrix". 
            // Implies: If I change PE, the rest stays as calculated? Or recalculates?
            // "Recalculate": implies other numbers might shift.
            // BUT: If I override PE to 5M, the solver should optimize around it?
            // Let's go with Safe/Simple: If user overrides specific cells, we respect those. 
            // For the REMAINING categories, we optimize normally?
            // Let's try:
            // 1. Calculate optimal TOTAL (unconstrained by manual split).
            // 2. See if manual overrides fit.
            // OR:
            // Just treat overrides as fixed inputs. If all 3 are overridden, total is fixed.
            // If only 1 is overridden, we optimize the other 2?

            // Current approach for robustness:
            // If ANY override exists for this year, we lock those values.
            // Then we optimize the *remaining* potential commitment for the non-locked categories.

            // However, the current optimizer solves for a single scalar "Total Commitment" then splits by ratio.
            // If we lock one category, the ratios approach breaks.

            // REVISED STRATEGY: 
            // 1. Calculate "Forced Commitment" from overrides.
            // 2. Adjust available ratios to exclude overridden categories.
            // 3. Solve for "Remaining Optimal Amount" for non-overridden categories.
            // 4. Combine.

            const forcedBreakdown = { secondaries: 0, pe: 0, vc: 0 };
            const activeRatios = { ...ratios };
            let hasOverride = false;
            let forcedTotal = 0;

            if (overrides) {
                ['secondaries', 'pe', 'vc'].forEach(cat => {
                    if (overrides[cat] !== undefined && overrides[cat] !== null) {
                        forcedBreakdown[cat] = overrides[cat]; // This is the manual amount
                        forcedTotal += overrides[cat];
                        activeRatios[cat] = 0; // Don't allocate via optimizer
                        hasOverride = true;
                    }
                });
            }

            // Normalize remaining ratios
            let activeRatioSum = activeRatios.secondaries + activeRatios.pe + activeRatios.vc;
            if (activeRatioSum > 0) {
                // Re-normalize to sum to 1
                activeRatios.secondaries /= activeRatioSum;
                activeRatios.pe /= activeRatioSum;
                activeRatios.vc /= activeRatioSum;
            }

            // Feasibility Function (Updated)
            // Solves for "additionalAmount" to distribute among ACTIVE categories
            const isFeasible = (additionalAmount) => {
                // Total new flows = Forced Flows + Additional Flows
                const newBreakdown = { ...forcedBreakdown };
                newBreakdown.secondaries += additionalAmount * activeRatios.secondaries;
                newBreakdown.pe += additionalAmount * activeRatios.pe;
                newBreakdown.vc += additionalAmount * activeRatios.vc;

                const newFlows = new Array(totalHorizon).fill(0);
                const newUnfunded = new Array(totalHorizon).fill(0);

                ['secondaries', 'pe', 'vc'].forEach(cat => {
                    if (newBreakdown[cat] > 0) {
                        const proj = calculateCommitmentProjection(newBreakdown[cat], profiles[cat], yearIdx, totalHorizon);
                        for (let t = 0; t < totalHorizon; t++) {
                            newFlows[t] += proj.cashflows[t];
                            newUnfunded[t] += proj.unfunded[t];
                        }
                    }
                });

                // Check Integrity
                let runningBalance = availableCapital;
                for (let t = 0; t < totalHorizon; t++) {
                    runningBalance += currentProjectedCashflows[t];
                    runningBalance += newFlows[t];

                    if (t >= yearIdx) {
                        const totalUnfunded = currentProjectedUnfunded[t] + newUnfunded[t];
                        if (runningBalance < totalUnfunded) return false;
                        if (runningBalance < 0) return false;

                        // LIQUIDITY CAP (Soft constraint logic from prev versions?)
                        // No, just solvency.
                    }
                }
                return true;
            };

            // Optimization
            // If ALL categories are overridden (activeRatioSum == 0), we just take forcedTotal.
            // But we still check feasibility to warn? Or just accept it (User override is god)?
            // User requested "automatically calculated through" implies calculations update.
            // If not feasible, should we block? Likely no, just show negative numbers.
            // BUT solver's job is to find optimal. If manual, we just process it.

            if (activeRatioSum === 0 && hasOverride) {
                optimal = forcedTotal;
                breakdown = forcedBreakdown;
                isManual = true;
            } else {
                // We have some freedom left. Solve for additionalAmount.

                // Bounds for Additional Amount
                let maxAdditional = availableCapital * 2;

                // Smoothing logic applies to TOTAL (Forced + Additional)
                if (smoothingEnabled) {
                    if (yearIdx === 0) {
                        const cap = availableCapital * firstYearCap;
                        maxAdditional = Math.max(0, cap - forcedTotal);
                    } else {
                        const growthCap = lastYearCommitment * (1 + maxYearlyChange);
                        const restartFloor = availableCapital * 0.05;
                        const maxTotal = Math.max(growthCap, restartFloor);
                        maxAdditional = Math.max(0, maxTotal - forcedTotal);
                    }
                }
                maxAdditional = Math.min(maxAdditional, availableCapital * 5); // Hard cap

                // Binary Search for Additional
                let low = 0;
                let high = maxAdditional;
                let bestAdd = 0;

                // Optimization: If isFeasible(high) is true, just take high? 
                // We want MAX feasible.

                for (let iter = 0; iter < 20; iter++) {
                    const mid = (low + high) / 2;
                    if (isFeasible(mid)) {
                        bestAdd = mid;
                        low = mid;
                    } else {
                        high = mid;
                    }
                }

                bestAdd = Math.floor(bestAdd / 1000) * 1000;

                // Construct final breakdown
                optimal = forcedTotal + bestAdd;
                breakdown = {
                    secondaries: forcedBreakdown.secondaries + (bestAdd * activeRatios.secondaries),
                    pe: forcedBreakdown.pe + (bestAdd * activeRatios.pe),
                    vc: forcedBreakdown.vc + (bestAdd * activeRatios.vc)
                };
            }

            // Store
            commitments.push({
                year: currentYear,
                amount: optimal,
                breakdown,
                ratios: { ...ratios },
                phase,
                isManual
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

            const committedAmount = t < pHorizon && commitments[t] ? commitments[t].amount : 0;
            const committedBreakdown = t < pHorizon && commitments[t] ? commitments[t].breakdown : { secondaries: 0, pe: 0, vc: 0 };

            annualReport.push({
                year: startYear + t,
                netCashflow: netFlow,
                endBalance: runningMult,
                totalCommitted: committedAmount,
                unfunded: currentProjectedUnfunded[t],
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

    // Use NAV Profiles for exposure calculation to ensure positive bars
    // If config doesn't have custom NAV profiles, use default estimates.
    const navProfiles = config?.navProfiles || NAV_PROFILES;

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
    let cumCommitments = 0; // NEW: Track cumulative commitments over time

    result.annualReport.forEach((r, idx) => {
        let yearCalls = 0;
        let yearDist = 0;
        let trueNav = 0;

        // Add this year's commitment to cumulative total
        // (commitments array is indexed by year offset from startYear)
        if (idx < result.commitments.length && result.commitments[idx]) {
            cumCommitments += result.commitments[idx].amount;
        }

        // Iterate all commitments made
        result.commitments.forEach(c => {
            ['secondaries', 'pe', 'vc'].forEach(cat => {
                if (c.breakdown[cat] > 0) {
                    const prof = profiles[cat];
                    const navProf = navProfiles[cat];
                    const age = r.year - c.year;

                    // Cashflow calc
                    if (age >= 0 && age < prof.length) {
                        const val = c.breakdown[cat] * prof[age];
                        if (val < 0) yearCalls += Math.abs(val);
                        else yearDist += val;
                    }

                    // NAV/Exposure calc
                    if (age >= 0 && age < navProf.length) {
                        trueNav += c.breakdown[cat] * navProf[age];
                    }
                }
            });
        });

        cumCalls += yearCalls;
        cumDist += yearDist;



        // NEW: Calculate AVAILABLE CASH correctly
        // Available Cash = Starting Capital - Cumulative Commitments + Cumulative Distributions
        // This represents money that can still be committed to new funds
        const availableCash = availableCapital - cumCommitments + cumDist;

        // Assign calculated values to report
        r.nav = trueNav;
        r.cumulativeCommitments = cumCommitments;  // NEW: Total locked capital
        r.cumulativeCalls = cumCalls;
        r.cumulativeDistributions = cumDist;
        r.availableCash = availableCash;           // NEW: True investable capital
        r.capitalCalled = cumCalls;                // NEW: Actual money spent

        // For chart display:
        // - investedCapital: NAV (market value of active investments)
        // - lockedCapital: cumulative commitments (money promised to funds)
        r.investedCapital = trueNav;
        r.lockedCapital = cumCommitments;

        // Total Value calculation per user request: 
        // "total value = available cash + commitments"
        // This avoids showing the J-curve drop (NAV < Cost) in early years.
        // Formula: (Capital - Commitments + Distributions) + Commitments = Capital + Distributions
        r.totalValue = availableCash + cumCommitments;

        // Profit calculation: Distributions - Capital Called (NOT commitments)
        r.realizedProfit = cumDist - cumCalls;
    });

    totalCalls = cumCalls;
    totalDistributions = cumDist;

    // Use end of projection for final metrics
    const finalReportItem = result.annualReport[result.totalHorizon - 1];

    // Calculate Fully Committed Year: First year where Cumulative Commitments >= Initial Available Capital
    // We can find this by looking at result.annualReport.
    // Note: r.cumulativeCommitments is available in the report.
    const fullyCommittedItem = result.annualReport.find(r => r.cumulativeCommitments >= availableCapital);
    const fullyCommittedYear = fullyCommittedItem ? fullyCommittedItem.year : null;

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
            fullyCommittedYear,
            finalNav: finalReportItem.nav,
            finalCash: finalReportItem.endBalance,
            finalTotalValue: finalReportItem.totalValue
        }
    };
}
