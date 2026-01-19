import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.resolve(__dirname, '..', 'prueba2.xlsx');
console.log('Reading Excel file:', filePath);

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Print header row and first data row for inspection
if (jsonData.length > 0) {
    console.log('Header row:', jsonData[0]);
    if (jsonData.length > 1) {
        console.log('First data row:', jsonData[1]);
    }
} else {
    console.log('Sheet is empty');
}
