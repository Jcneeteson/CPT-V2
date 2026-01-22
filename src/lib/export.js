import ExcelJS from 'exceljs';

export async function exportToExcel(templateFile, result, params) {
    const workbook = new ExcelJS.Workbook();
    const buffer = await templateFile.arrayBuffer();
    await workbook.xlsx.load(buffer);

    // 1. Helper to find columns by header name
    const getColumnIndex = (sheet, headerRegex, startRow = 1) => {
        // Search first 10 rows for header
        for (let r = startRow; r <= 10; r++) {
            const row = sheet.getRow(r);
            for (let c = 1; c <= row.cellCount; c++) {
                const val = row.getCell(c).value;
                if (val && headerRegex.test(String(val))) {
                    return { col: c, headerRow: r };
                }
            }
        }
        return null;
    };

    // 2. Process "Planning" Sheet
    const planningSheet = workbook.getWorksheet('Planning') || workbook.worksheets[0]; // Fallback to first sheet

    if (planningSheet) {
        // Identify columns
        // We look for "Year" or "Jaar", "Secondaries", "PE", "VC"
        const colYear = getColumnIndex(planningSheet, /(Year|Jaar)/i);
        const colSec = getColumnIndex(planningSheet, /(Secondaries)/i);
        const colPe = getColumnIndex(planningSheet, /(PE|Private Equity)/i);
        const colVc = getColumnIndex(planningSheet, /(VC|Venture Capital)/i);

        if (colYear && colSec && colPe && colVc) {
            const headerRow = colYear.headerRow; // Assume headers are aligned

            // Iterate through results and write to matching year rows
            result.commitments.forEach(c => {
                // Find row with this year (search below header)
                let targetRow;
                for (let r = headerRow + 1; r <= 1000; r++) {
                    const cellVal = planningSheet.getCell(r, colYear.col).value;
                    if (cellVal == c.year) {
                        targetRow = planningSheet.getRow(r);
                        break;
                    }
                }

                // If row exists, update it. If not, maybe append? 
                // Ideally we only update existing rows to preserve template structure.
                if (targetRow) {
                    targetRow.getCell(colSec.col).value = c.breakdown.secondaries;
                    targetRow.getCell(colPe.col).value = c.breakdown.pe;
                    targetRow.getCell(colVc.col).value = c.breakdown.vc;
                    targetRow.commit();
                } else {
                    // Warning: Year not found in template. 
                    // We could append, but that might break formulas.
                    // Detailed logging needed? For now, we skip.
                    console.warn(`Year ${c.year} not found in template.`);
                }
            });
        } else {
            throw new Error('Could not find required columns (Year, Secondaries, PE, VC) in "Planning" sheet.');
        }
    }

    // 3. Process "Samenvatting" Sheet (Optional: Update Total Committed)
    const summarySheet = workbook.getWorksheet('Samenvatting');
    if (summarySheet) {
        // Try to find a cell labeled "Total Committed" and update the value next to it
        // This is heuristic.
        // Let's iterate cells to find label
        let found = false;
        summarySheet.eachRow((row, rowNumber) => {
            row.eachCell((cell, colNumber) => {
                if (!found && /(Total Committed|Totaal Gecommitteerd)/i.test(String(cell.value))) {
                    // Update the cell to the right?
                    const nextCell = row.getCell(colNumber + 1);
                    nextCell.value = result.metrics.totalCommitted;
                    found = true;
                }
            });
        });
    }

    // 4. Download
    const outBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CPT_Plan_${params.startYear}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
}
