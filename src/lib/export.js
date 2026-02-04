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
 * Updated for CPT Template v4 (Simple Input Population)
 */
export async function exportToExcel(result, params, clientName) {
    try {
        console.log('Starting Excel export (Template v4)...');
        console.log(`Client: ${clientName}`);

        if (!result || !result.commitments) {
            throw new Error('No commitments data available');
        }

        // 1. Prepare Data
        const commitments = [];
        result.commitments.forEach(commitment => {
            if (commitment.breakdown.secondaries > 0) {
                commitments.push({ type: 'Secondaries', amount: Math.round(commitment.breakdown.secondaries), year: commitment.year });
            }
            if (commitment.breakdown.pe > 0) {
                commitments.push({ type: 'PE', amount: Math.round(commitment.breakdown.pe), year: commitment.year });
            }
            if (commitment.breakdown.vc > 0) {
                commitments.push({ type: 'VC', amount: Math.round(commitment.breakdown.vc), year: commitment.year });
            }
        });

        const validCommitments = commitments
            .filter(c => c.amount > 0 && c.year && c.type)
            .sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                // Sort order: Secondaries, PE, VC
                const typePriority = { 'Secondaries': 0, 'PE': 1, 'VC': 2 };
                return typePriority[a.type] - typePriority[b.type];
            });

        // 2. Load Template
        const response = await fetch('/CPT_export_template.xlsx');
        if (!response.ok) throw new Error("Failed to load template file");
        const arrayBuffer = await response.arrayBuffer();

        // 3. Unzip
        const zip = await JSZip.loadAsync(arrayBuffer);

        // 4. Read Sheet 1 (Cashflow Matrix / Inputs)
        // Adjust sheet path if necessary, usually sheet1 is the main active sheet
        const sheetPath = "xl/worksheets/sheet1.xml";
        const sheetXmlStr = await zip.file(sheetPath).async("string");

        // 5. Parse XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(sheetXmlStr, "text/xml");

        // 6. Update Header Inputs
        // C4: Client Name
        // C5: Available Capital
        // Note: Using "inlineStr" for strings, "number" for values

        // We find the 'v' (value) nodes or 'is'/'t' (inline string) nodes.
        // Helper updateCellInDoc handles basic type switching.

        updateCellInDoc(doc, "C4", clientName, "inlineStr");
        updateCellInDoc(doc, "C5", params.availableCapital, "number");

        // 7. Update Commitments List (Starting at Row 9)
        // Cols: B (Fund Name), C (Commitment), E (Vintage)

        const DATA_START_ROW = 9;
        const MAX_ROWS = 100; // Cap to avoid massive loops, template likely has limit

        let currentRowIdx = DATA_START_ROW;

        for (const comm of validCommitments) {
            if (currentRowIdx > DATA_START_ROW + MAX_ROWS) break;

            const rowNode = findRow(doc, currentRowIdx);
            if (rowNode) {
                // Determine Generic Name based on type
                // e.g. "Dummy PE", "Dummy VC", "Dummy Secondaries"
                const fundName = `Dummy ${comm.type}`;

                // Col B: Fund Name
                updateCellInRow(doc, rowNode, "B", currentRowIdx, fundName, "inlineStr");

                // Col C: Commitment Amount
                updateCellInRow(doc, rowNode, "C", currentRowIdx, comm.amount, "number");

                // Col E: Vintage / Start Year
                updateCellInRow(doc, rowNode, "E", currentRowIdx, comm.year, "number");
            }
            currentRowIdx++;
        }

        // 8. Clean up remaining rows (Clear content)
        // If the template has pre-filled example data, we must clear it.
        // We scan a reasonable range after our data ends.
        for (let r = currentRowIdx; r <= DATA_START_ROW + 50; r++) { // Clear next 50 rows just in case
            const rowNode = findRow(doc, r);
            if (rowNode) {
                // Check if B or C has data, if so clear it. 
                // We clear B, C, E specifically.
                updateCellInRow(doc, rowNode, "B", r, "", "inlineStr");
                updateCellInRow(doc, rowNode, "C", r, "", "inlineStr");
                updateCellInRow(doc, rowNode, "E", r, "", "inlineStr");
            }
        }

        // 9. Serialize and Save
        const serializer = new XMLSerializer();
        const newSheetXml = serializer.serializeToString(doc);
        zip.file(sheetPath, newSheetXml);

        // 10. Generate Blob
        const blob = await zip.generateAsync({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });

        // Generate filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `CPT_${clientName.replace(/\s+/g, '_')}_${dateStr}.xlsx`;

        console.log('✅ Export successful');
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
