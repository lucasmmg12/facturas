const path = require('path');
const XLSX = require('xlsx');

const filePath = path.resolve(__dirname, '..', 'prueba2.xlsx');
console.log('Reading Excel file:', filePath);

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

if (data.length === 0) {
    console.log('Empty sheet');
    process.exit(0);
}

const header = data[0];
const firstRow = data[1] || [];
console.log('Header:', header);
console.log('First row:', firstRow);

// Build a sample output object based on header names (assuming they match desired fields)
const sample = {};
header.forEach((col, idx) => {
    sample[col] = firstRow[idx] !== undefined ? firstRow[idx] : null;
});
console.log('Sample JSON:', JSON.stringify(sample, null, 2));
