import ExcelJS from 'exceljs';

/**
 * Parses the Momentum Excel file to extract custom fund profiles.
 * Looks for "Capital Call&Distributions data" sheet and "Factor na VPB" rows.
 * @param {File} file - The uploaded Excel file.
 * @returns {Promise<Object>} - Format: { pe: number[], vc: number[], secondaries: number[] }
 */
export async function parseFundData(file) {
    const workbook = new ExcelJS.Workbook();
    try {
        const buffer = await file.arrayBuffer();
        await workbook.xlsx.load(buffer);
    } catch {
        throw new Error("Failed to load Excel file. Ensure it is a valid .xlsx file.");
    }

    const sheet = workbook.getWorksheet("Capital Call&Distributions data");
    if (!sheet) {
        throw new Error("Sheet 'Capital Call&Distributions data' not found.");
    }

    const profiles = {
        pe: null,
        vc: null,
        secondaries: null
    };

    // Helper: Normalize label
    const normalizeLabel = (s) => {
        if (!s) return "";
        const str = String(s).toLowerCase();
        if (str.includes('pe') || str.includes('private equity') || str.includes('marklink')) return 'pe';
        if (str.includes('vc') || str.includes('venture')) return 'vc';
        if (str.includes('secondaries') || str.includes('secondary')) return 'secondaries';
        return null; // Unknown
    };

    // Iterate rows to find "Factor na VPB"
    // Based on analysis:
    // Row 25: PE-FOF | Factor na VPB
    // Row 35: VC-FOF | Factor na VPB
    // Row 45: Secondaries | Factor na VPB
    // But user might add more funds or rows might shift. 
    // Robust strategy: Scan all rows. If Col 2 == "Factor na VPB", check Col 1 for type.

    sheet.eachRow((row, rowNumber) => {
        const labelCell = row.getCell(1).value; // Col A
        const descCell = row.getCell(2).value; // Col B

        if (descCell && String(descCell).includes('Factor na VPB')) {
            const type = normalizeLabel(labelCell);
            if (type) {
                // Extract profile from Col C (3) onwards
                const profile = [];
                // Allow up to 20 years (Cols 3 to 22)
                for (let c = 3; c <= 25; c++) {
                    const val = row.getCell(c).result ?? row.getCell(c).value; // handle formulas if necessary 
                    // Note: ExcelJS .result handles cached formula values. If not calculated, use value.
                    // The uploaded file likely has calculated values.

                    if (typeof val === 'number') {
                        profile.push(val);
                    } else if (val === null || val === '') {
                        // End of stream? Or 0? 
                        // Check strictly if it's 0 or empty.
                        // Usually these profiles trail off with 0s.
                        profile.push(0);
                    }
                }

                // Trim trailing zeros? Not strictly necessary for solver but good for cleanup.
                // Keep strictly length 15-20.

                if (!profiles[type]) {
                    profiles[type] = profile;
                    console.log(`Loaded profile for ${type} from row ${rowNumber}`);
                }
            }
        }
    });

    // Validation
    if (!profiles.pe && !profiles.vc && !profiles.secondaries) {
        throw new Error("No profiles found. Ensure rows have 'Factor na VPB' in column B and a valid type in column A.");
    }

    // fallback for missing ones?
    // User might want to partially override. The wrapper will merge.

    return profiles;
}
