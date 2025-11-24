import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

// Interfaces for Excel Row Data
interface ProviderRow {
  'Código': number;
  'Razón social': string;
  'Nro. de documento': string | number;
  'Teléfono 1'?: string;
  'Correo electrónico'?: string;
}

interface ConceptRow {
  'Código': number;
  'Descripción': string;
  'Inhabilitado': string;
  'Descripción de IVA': string;
  'Identificar el concepto como un gasto para la puesta en marcha de bienes': string;
  'Descripción de clasificación habitual para SIAP': string;
  'Descripción de Percepción de IVA': string;
}

interface AliquotRow {
  'Código': number;
  'Descripción': string;
  'Porcentaje': number;
  'Importe mínimo'?: number;
  'Descripción de provincia'?: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  count?: number;
  errors?: string[];
}

// Helper to read Excel file
const readExcel = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

// --- PROVEEDORES ---

export async function importProviders(file: File): Promise<ImportResult> {
  try {
    const data = (await readExcel(file)) as any[];
    const errors: string[] = [];
    const validRows: any[] = [];

    // Validate Columns
    if (data.length > 0) {
      const requiredCols = ['Código', 'Razón social', 'Nro. de documento'];
      const fileCols = Object.keys(data[0]);
      const missingCols = requiredCols.filter((col) => !fileCols.includes(col));
      if (missingCols.length > 0) {
        return {
          success: false,
          message: `Faltan columnas obligatorias: ${missingCols.join(', ')}`,
        };
      }
    } else {
      return { success: false, message: 'El archivo está vacío.' };
    }

    // Validate Rows
    data.forEach((row, index) => {
      const rowNum = index + 2; // Excel row number (1-based + header)
      if (!row['Código'] || isNaN(Number(row['Código']))) {
        errors.push(`Fila ${rowNum}: Código inválido.`);
      }
      if (!row['Razón social']) {
        errors.push(`Fila ${rowNum}: Razón social vacía.`);
      }
      if (!row['Nro. de documento']) {
        errors.push(`Fila ${rowNum}: Nro. de documento vacío.`);
      }

      if (errors.length === 0) {
        // Clean CUIT
        const cuitStr = String(row['Nro. de documento']).replace(/[-\s]/g, '');

        validRows.push({
          cuit: cuitStr,
          razon_social: row['Razón social'],
          tango_supplier_code: String(row['Código']),
          phone: row['Teléfono 1'] ? String(row['Teléfono 1']) : null,
          email: row['Correo electrónico'] ? String(row['Correo electrónico']) : null,
          active: true,
          updated_at: new Date().toISOString(),
        });
      }
    });

    if (errors.length > 0) {
      return { success: false, message: 'Errores de validación en el archivo.', errors };
    }

    // Remove duplicates (keep last occurrence by CUIT)
    const uniqueRows = new Map();
    validRows.forEach(row => {
      uniqueRows.set(row.cuit, row);
    });
    const finalRows = Array.from(uniqueRows.values());

    // Upsert to Supabase
    const { error } = await supabase
      .from('suppliers')
      .upsert(finalRows, { onConflict: 'cuit' });

    if (error) throw error;

    return {
      success: true,
      message: `Se importaron ${finalRows.length} proveedores correctamente${validRows.length !== finalRows.length ? ` (se eliminaron ${validRows.length - finalRows.length} duplicados)` : ''}.`,
      count: finalRows.length
    };

  } catch (error: any) {
    console.error('Error importing providers:', error);
    return { success: false, message: `Error al procesar el archivo: ${error.message}` };
  }
}

// --- CONCEPTOS ---

export async function importConcepts(file: File): Promise<ImportResult> {
  try {
    const data = (await readExcel(file)) as any[];
    const errors: string[] = [];
    const validRows: any[] = [];

    // Validate Columns
    if (data.length > 0) {
      const requiredCols = ['Código', 'Descripción'];
      const fileCols = Object.keys(data[0]);
      const missingCols = requiredCols.filter((col) => !fileCols.includes(col));
      if (missingCols.length > 0) {
        return {
          success: false,
          message: `Faltan columnas obligatorias: ${missingCols.join(', ')}`,
        };
      }
    } else {
      return { success: false, message: 'El archivo está vacío.' };
    }

    // Validate Rows
    data.forEach((row, index) => {
      const rowNum = index + 2;
      if (!row['Código']) errors.push(`Fila ${rowNum}: Código vacío.`);
      if (!row['Descripción']) errors.push(`Fila ${rowNum}: Descripción vacía.`);

      validRows.push({
        tango_concept_code: String(row['Código']),
        description: row['Descripción'],
        active: row['Inhabilitado'] !== 'Si', // Active if not disabled
      });
    });

    if (errors.length > 0) {
      return { success: false, message: 'Errores de validación.', errors };
    }

    // Remove duplicates (keep last occurrence by code)
    const uniqueRows = new Map();
    validRows.forEach(row => {
      uniqueRows.set(row.tango_concept_code, row);
    });
    const finalRows = Array.from(uniqueRows.values());

    const { error } = await supabase
      .from('tango_concepts')
      .upsert(finalRows, { onConflict: 'tango_concept_code' });

    if (error) throw error;

    return {
      success: true,
      message: `Se importaron ${finalRows.length} conceptos${validRows.length !== finalRows.length ? ` (se eliminaron ${validRows.length - finalRows.length} duplicados)` : ''}.`,
      count: finalRows.length
    };

  } catch (error: any) {
    return { success: false, message: `Error: ${error.message}` };
  }
}

// --- ALICUOTAS ---

export async function importAliquotas(file: File): Promise<ImportResult> {
  try {
    const data = (await readExcel(file)) as any[];
    const errors: string[] = [];
    const validRows: any[] = [];

    // Validate Columns
    if (data.length > 0) {
      const requiredCols = ['Código', 'Descripción', 'Porcentaje'];
      const fileCols = Object.keys(data[0]);
      const missingCols = requiredCols.filter((col) => !fileCols.includes(col));
      if (missingCols.length > 0) {
        return {
          success: false,
          message: `Faltan columnas obligatorias: ${missingCols.join(', ')}`,
        };
      }
    } else {
      return { success: false, message: 'El archivo está vacío.' };
    }

    // Validate Rows
    data.forEach((row, index) => {
      const rowNum = index + 2;
      if (!row['Código']) errors.push(`Fila ${rowNum}: Código vacío.`);

      validRows.push({
        code: String(row['Código']), // Mapping 'Código' to 'code' (internal)
        tango_code: String(row['Código']), // Mapping 'Código' to 'tango_code'
        description: row['Descripción'],
        tax_type: 'IVA', // Defaulting to IVA as it's not in the file
        rate: typeof row['Porcentaje'] === 'string'
          ? Number(row['Porcentaje'].replace(',', '.'))
          : Number(row['Porcentaje']),
        active: true,
      });
    });

    if (errors.length > 0) {
      return { success: false, message: 'Errores de validación.', errors };
    }

    // Remove duplicates (keep last occurrence by code)
    const uniqueRows = new Map();
    validRows.forEach(row => {
      uniqueRows.set(row.code, row);
    });
    const finalRows = Array.from(uniqueRows.values());

    const { error } = await supabase
      .from('tax_codes')
      .upsert(finalRows, { onConflict: 'code' });

    if (error) throw error;

    return {
      success: true,
      message: `Se importaron ${finalRows.length} alícuotas${validRows.length !== finalRows.length ? ` (se eliminaron ${validRows.length - finalRows.length} duplicados)` : ''}.`,
      count: finalRows.length
    };

  } catch (error: any) {
    return { success: false, message: `Error: ${error.message}` };
  }
}
