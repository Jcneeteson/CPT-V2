// This file handles exporting CPT commitments to the new Excel template structure

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { DEFAULT_CASHFLOW_PROFILES } from '../config/dummyData';

/**
 * Export commitments to Excel using CPT Template v2.0
 * 
 * @param {object} result - Result object from CPT solver
 * @param {object} params - Parameters object with availableCapital, startYear, etc.
 * @param {string} clientName - Name of the client
 * @returns {Blob} Excel file as blob for download
 */
/**
 * Export commitments using direct XML manipulation (JSZip)
 * This preserves charts and complex formatting that ExcelJS might drop.
 */
export async function exportToExcel(result, params, clientName) {
    try {
        console.log('Starting Surgical Excel export...');
        console.log(`Client: ${clientName}`);

        if (!result || !result.commitments) {
            throw new Error('No commitments data available');
        }

        // 1. Prepare Data
        const commitments = [];
        result.commitments.forEach(commitment => {
            if (commitment.breakdown.secondaries > 0) {
                commitments.push({ type: 'secondaries', amount: Math.round(commitment.breakdown.secondaries), year: commitment.year });
            }
            if (commitment.breakdown.pe > 0) {
                commitments.push({ type: 'pe', amount: Math.round(commitment.breakdown.pe), year: commitment.year });
            }
            if (commitment.breakdown.vc > 0) {
                commitments.push({ type: 'vc', amount: Math.round(commitment.breakdown.vc), year: commitment.year });
            }
        });

        const validCommitments = commitments
            .filter(c => c.amount > 0 && c.year && c.type)
            .sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                const typePriority = { 'secondaries': 0, 'pe': 1, 'vc': 2 };
                return typePriority[a.type] - typePriority[b.type];
            });

        // 2. Load Template
        const response = await fetch('/CPT_template_updated.xlsx');
        if (!response.ok) throw new Error("Failed to load template");
        const arrayBuffer = await response.arrayBuffer();

        // 3. Unzip
        const zip = await JSZip.loadAsync(arrayBuffer);

        // 4. Read Sheet 1 (Cashflow Matrix)
        const sheetPath = "xl/worksheets/sheet1.xml";
        const sheetXmlStr = await zip.file(sheetPath).async("string");

        // 5. Parse XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(sheetXmlStr, "text/xml");

        // 6. Update Metadata (A6: Client, A7: Date)
        updateCellInDoc(doc, "A6", `Client: ${clientName}`, "inlineStr");
        updateCellInDoc(doc, "A7", `Export datum: ${new Date().toLocaleDateString('nl-NL')}`, "inlineStr");
        updateCellInDoc(doc, "A8", `Beschikbaar Kapitaal: €${params.availableCapital.toLocaleString('nl-NL')}`, "inlineStr");

        // 6a. Parse Header Row (Row 8) to map Years to Columns
        const yearColMap = {}; // { 2025: "F", 2026: "G", ... }
        const headerRow = findRow(doc, 8);
        if (headerRow) {
            const cells = headerRow.getElementsByTagName("c");
            for (let i = 0; i < cells.length; i++) {
                const c = cells[i];
                const r = c.getAttribute("r"); // e.g. "F8"
                const col = r.replace(/[0-9]/g, ''); // "F"

                // Get value
                let val = null;
                const vNode = c.getElementsByTagName("v")[0];
                if (vNode) val = parseFloat(vNode.textContent);

                // If valid year (e.g. > 2000), add to map
                if (val && val > 2000 && val < 2100) {
                    yearColMap[Math.round(val)] = col;
                }
            }
        }
        console.log('Year Map:', yearColMap);

        // 7. Update Commitments
        const DATA_START_ROW = 9;
        const typeMap = { 'secondaries': 'Secondaries', 'pe': 'PE', 'vc': 'VC' };
        const irrMap = { 'secondaries': 0.15, 'pe': 0.18, 'vc': 0.25 }; // Default IRRs
        const profiles = params.config?.profiles || DEFAULT_CASHFLOW_PROFILES;

        let currentRowIdx = DATA_START_ROW;
        for (const comm of validCommitments) {
            if (currentRowIdx > 100) break;

            const rowNode = findRow(doc, currentRowIdx);
            if (rowNode) {
                const typeStr = typeMap[comm.type] || comm.type;
                updateCellInRow(doc, rowNode, "A", currentRowIdx, typeStr, "inlineStr");
                updateCellInRow(doc, rowNode, "B", currentRowIdx, "EUR", "inlineStr");
                updateCellInRow(doc, rowNode, "C", currentRowIdx, comm.amount, "number");

                // IRR in Col D
                const irr = irrMap[comm.type] || 0;
                updateCellInRow(doc, rowNode, "D", currentRowIdx, irr, "number");

                // Year is in E (INSTAP)
                updateCellInRow(doc, rowNode, "E", currentRowIdx, comm.year, "number");

                // Plot Cashflows
                const profile = profiles[comm.type];
                if (profile) {
                    profile.forEach((factor, yearOffset) => {
                        const projectionYear = comm.year + yearOffset;
                        const colKey = yearColMap[projectionYear];
                        if (colKey) {
                            const cashflow = comm.amount * factor;
                            updateCellInRow(doc, rowNode, colKey, currentRowIdx, cashflow, "number");
                        }
                    });
                }
            }
            currentRowIdx++;
        }

        // Clean up remaining rows if any (up to 100)
        // We also need to clear the projection columns for these rows!
        // We'll assume projection columns go from F onwards.
        const allProjCols = Object.values(yearColMap);

        for (let r = currentRowIdx; r <= 100; r++) {
            const rowNode = findRow(doc, r);
            if (rowNode) {
                // Clear values
                updateCellInRow(doc, rowNode, "A", r, "", "inlineStr");
                updateCellInRow(doc, rowNode, "B", r, "", "inlineStr");
                updateCellInRow(doc, rowNode, "C", r, "", "inlineStr");
                updateCellInRow(doc, rowNode, "D", r, "", "inlineStr");
                updateCellInRow(doc, rowNode, "E", r, "", "inlineStr");

                // Clear projection cells
                allProjCols.forEach(col => {
                    updateCellInRow(doc, rowNode, col, r, "", "inlineStr");
                });
            }
        }

        // 8. Serialize and Save
        const serializer = new XMLSerializer();
        const newSheetXml = serializer.serializeToString(doc);
        zip.file(sheetPath, newSheetXml);

        // 9. Generate Blob
        const blob = await zip.generateAsync({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `CPT_${clientName.replace(/\s+/g, '_')}_${dateStr}.xlsx`;

        console.log('✅ Surgical export successful');
        return { blob, filename };

    } catch (error) {
        console.error('❌ Export failed:', error);
        throw new Error(`Excel export failed: ${error.message}`);
    }
}

// XML Helper Functions

function findRow(doc, rowNum) {
    const rows = doc.getElementsByTagName("row");
    // This is O(N) scan, naive but okay for 100 rows.
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute("r") == rowNum) return rows[i];
    }
    return null; // Should handle creation if missing, but template likely has them
}

function updateCellInDoc(doc, cellRef, value, type) {
    // Naive search for cell based on Row number extracted from ref
    const rowNum = cellRef.match(/\d+/)[0];
    const row = findRow(doc, rowNum);
    if (row) {
        const colLetter = cellRef.replace(/[0-9]/g, '');
        updateCellInRow(doc, row, colLetter, rowNum, value, type);
    }
}

function updateCellInRow(doc, rowNode, colLetter, rowNum, value, type) {
    const cellRef = colLetter + rowNum;
    let cell = null;
    const cells = rowNode.getElementsByTagName("c");
    for (let i = 0; i < cells.length; i++) {
        if (cells[i].getAttribute("r") === cellRef) {
            cell = cells[i];
            break;
        }
    }

    if (!cell) {
        // Create cell if missing (naive append)
        cell = doc.createElementNS(doc.documentElement.namespaceURI, "c");
        cell.setAttribute("r", cellRef);
        rowNode.appendChild(cell);
    }

    // Clear children
    while (cell.firstChild) {
        cell.removeChild(cell.firstChild);
    }

    // Update value
    if (value === "" || value === null || value === undefined) {
        if (cell.hasAttribute("t")) cell.removeAttribute("t");
        // Empty cell
        return;
    }

    if (type === "inlineStr") {
        cell.setAttribute("t", "inlineStr");
        const is = doc.createElementNS(doc.documentElement.namespaceURI, "is");
        const t = doc.createElementNS(doc.documentElement.namespaceURI, "t");
        t.textContent = value;
        is.appendChild(t);
        cell.appendChild(is);
    } else { // number
        // Remove 't' or set to 'n' (default)
        if (cell.hasAttribute("t")) cell.removeAttribute("t");
        const v = doc.createElementNS(doc.documentElement.namespaceURI, "v");
        v.textContent = value;
        cell.appendChild(v);
    }
}

/**
 * Helper function to download the blob as a file
 */
export function downloadBlob(blob, filename) {
    if (!blob) return;
    saveAs(blob, filename || 'export.xlsx');
}

/**
 * Main export function to be called from UI
 * 
 * @param {object} result - Result object from CPT solver
 * @param {object} params - Parameters object
 * @param {string} clientName - Client name from modal
 */
export async function handleExport(result, params, clientName) {
    try {
        const { blob, filename } = await exportToExcel(result, params, clientName);
        downloadBlob(blob, filename);
        return { success: true, filename };
    } catch (error) {
        console.error('Export failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// VALIDATION HELPER
// ============================================================================

/**
 * Validate commitments before export
 */
export function validateCommitments(commitments) {
    const errors = [];

    if (!Array.isArray(commitments)) {
        errors.push('Commitments must be an array');
        return { valid: false, errors };
    }

    if (commitments.length === 0) {
        errors.push('No commitments to export');
        return { valid: false, errors };
    }

    const maxCapacity = 91;
    const validCount = commitments.filter(c => c.amount > 0 && c.year && c.type).length;

    if (validCount === 0) {
        errors.push('No valid commitments found');
    }

    if (validCount > maxCapacity) {
        errors.push(
            `${validCount} commitments exceed template capacity (${maxCapacity}). ` +
            `${validCount - maxCapacity} will be skipped.`
        );
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings: validCount > maxCapacity ? [errors.pop()] : []
    };
}
