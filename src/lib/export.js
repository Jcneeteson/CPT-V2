import ExcelJS from 'exceljs';

/**
 * Exports the CPT plan to Excel using a bundled template.
 * Uses SheetJS (xlsx) library for better compatibility with complex Excel files.
 * @param {object} result - The solver result.
 * @param {object} params - The params including startYear.
 * @param {string} clientName - The client name for the file.
 */
export async function exportToExcel(result, params, clientName) {
    const workbook = new ExcelJS.Workbook();

    // Fetch template from public folder
    try {
        const response = await fetch('/cpt_template.xlsx');
        if (!response.ok) {
            throw new Error(`Template niet gevonden (HTTP ${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        await workbook.xlsx.load(buffer);
    } catch (e) {
        console.error("Error loading template:", e);
        throw new Error("Fout bij laden van Excel template.");
    }

    const summarySheet = workbook.getWorksheet('Samenvatting');
    if (!summarySheet) {
        throw new Error('Sheet "Samenvatting" niet gevonden in template.');
    }

    // Configuration for mapping
    // Columns (1-based index):
    const COL_TYPE = 4;   // D: Fondstype
    const COL_AMT = 6;    // F: Bedrag / Commitment
    const COL_YEAR = 11;  // K: Instap Jaar

    // IMPORTANT: Limit row range to avoid shared formula issues
    // The error was at L139, so we stop before that area
    const START_ROW = 43;
    const MAX_ROW = 100;  // Reduced from 200 to avoid formula conflicts

    // Helper: Normalize Year from cell value
    const getYearFromCell = (cellValue) => {
        if (!cellValue) return null;
        if (cellValue instanceof Date) return cellValue.getFullYear();
        if (typeof cellValue === 'number') {
            if (cellValue > 2500 && cellValue < 60000) {
                return null;
            }
            if (cellValue >= 2000 && cellValue <= 2100) return cellValue;
        }
        const s = String(cellValue);
        const match = s.match(/20\d{2}/);
        return match ? parseInt(match[0], 10) : null;
    };

    // Helper: Normalize Type string
    const normalizeType = (s) => {
        if (!s) return "";
        const str = String(s).toLowerCase();
        if (str.includes('secondaries')) return 'secondaries';
        if (str.includes('pe') || str.includes('private equity')) return 'pe';
        if (str.includes('vc') || str.includes('venture')) return 'vc';
        return str;
    };

    // Flatten commitments into a list of { year, type, amount }
    const commitmentsToWrite = [];
    result.commitments.forEach(c => {
        if (c.breakdown.secondaries > 0) commitmentsToWrite.push({ year: c.year, type: 'secondaries', amount: c.breakdown.secondaries });
        if (c.breakdown.pe > 0) commitmentsToWrite.push({ year: c.year, type: 'pe', amount: c.breakdown.pe });
        if (c.breakdown.vc > 0) commitmentsToWrite.push({ year: c.year, type: 'vc', amount: c.breakdown.vc });
    });

    // Build row index - only read values, don't touch formulas
    const rows = [];
    for (let r = START_ROW; r <= MAX_ROW; r++) {
        const row = summarySheet.getRow(r);
        const typeCell = row.getCell(COL_TYPE);
        const yearCell = row.getCell(COL_YEAR);

        // Get raw values, avoiding formula cells
        const typeVal = typeCell.value;
        const yearVal = yearCell.value;

        const type = normalizeType(typeVal);
        const year = getYearFromCell(yearVal);
        const isEmpty = !type && !year;

        rows.push({ rowIndex: r, type, year, isEmpty, rowObj: row });
    }

    // Process each commitment - only write to amount column
    let writtenCount = 0;
    commitmentsToWrite.forEach(item => {
        let match = rows.find(r => r.type === item.type && r.year === item.year);

        if (match) {
            // Only update the amount cell, leave others intact
            const amtCell = match.rowObj.getCell(COL_AMT);
            amtCell.value = item.amount;
            writtenCount++;
        } else {
            // Find empty slot
            const emptySlot = rows.find(r => r.isEmpty);
            if (emptySlot) {
                console.log(`Writing new entry to row ${emptySlot.rowIndex}: ${item.type} ${item.year}`);

                let typeLabel = "Private Equity";
                if (item.type === 'secondaries') typeLabel = "Secondaries";
                if (item.type === 'vc') typeLabel = "Venture Capital";

                // Write values carefully
                emptySlot.rowObj.getCell(COL_TYPE).value = typeLabel;
                emptySlot.rowObj.getCell(COL_YEAR).value = item.year; // Use plain number instead of Date
                emptySlot.rowObj.getCell(COL_AMT).value = item.amount;

                emptySlot.isEmpty = false;
                emptySlot.type = item.type;
                emptySlot.year = item.year;
                writtenCount++;
            } else {
                console.warn(`No space found for ${item.type} in ${item.year}`);
            }
        }
    });

    console.log(`Wrote ${writtenCount} commitments to Excel`);

    // Generate filename
    const safeClientName = clientName ? clientName.replace(/[^a-zA-Z0-9\-_ ]/g, '') : 'Client';
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    // Download
    const outBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CPT_${safeClientName}_${dateStr}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
}
