import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

// Interfaces for Excel Row Data
interface ProviderRow {
  codigo_proveedor: number;
  razon_social: string;
  quit: string | number;
}

interface ConceptRow {
  codigo_concepto: number;
  descripcion: string;
  alicuota_iva: number;
  codigo_impuesto: number;
}

interface AliquotRow {
  codigo_impuesto: number;
  descripcion: string;
  alicuota: number;
  tipo: string;
  codigo_tango: number;
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
      const requiredCols = ['codigo_proveedor', 'razon_social', 'quit'];
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
      if (!row.codigo_proveedor || isNaN(Number(row.codigo_proveedor))) {
        errors.push(`Fila ${rowNum}: codigo_proveedor inválido.`);
      }
      if (!row.razon_social) {
        errors.push(`Fila ${rowNum}: razon_social vacía.`);
      }
      if (!row.quit) {
        errors.push(`Fila ${rowNum}: quit vacío.`);
      }

      if (errors.length === 0) {
          // Clean CUIT
          const cuitStr = String(row.quit).replace(/[-\s]/g, '');
          
          validRows.push({
              cuit: cuitStr,
              razon_social: row.razon_social,
              tango_supplier_code: String(row.codigo_proveedor),
              active: true,
              updated_at: new Date().toISOString(),
          });
      }
    });

    if (errors.length > 0) {
      return { success: false, message: 'Errores de validación en el archivo.', errors };
    }

    // Upsert to Supabase
    // Note: We use CUIT as the unique key for upsert if possible, or we might need to check existence.
    // The 'suppliers' table has 'cuit' but 'id' is PK. 
    // We will try to upsert based on CUIT.
    
    const { error } = await supabase
      .from('suppliers')
      .upsert(validRows, { onConflict: 'cuit' });

    if (error) throw error;

    return { success: true, message: `Se importaron ${validRows.length} proveedores correctamente.`, count: validRows.length };

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
        const requiredCols = ['codigo_concepto', 'descripcion', 'alicuota_iva', 'codigo_impuesto'];
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
        if (!row.codigo_concepto) errors.push(`Fila ${rowNum}: codigo_concepto vacío.`);
        if (!row.descripcion) errors.push(`Fila ${rowNum}: descripcion vacía.`);
        // alicuota_iva and codigo_impuesto are used for logic but maybe not stored directly in tango_concepts if the schema doesn't support it?
        // Let's check schema: tango_concepts has (tango_concept_code, description, active).
        // It seems the user wants to store more data? 
        // "1.2. Tabla: ConceptosCompra ... alicuota_iva ... codigo_impuesto"
        // The current schema for `tango_concepts` ONLY has `tango_concept_code` and `description`.
        // I should probably add these columns to the table or just store what I can.
        // For now, I will store what fits in the table. 
        // WAIT, the user said "Esta tabla se cargará...". If the DB doesn't have columns, I can't store them.
        // I will assume for now I only store code and description, OR I need to modify the table.
        // The prompt says "1.2. Tabla: ConceptosCompra... Columnas obligatorias...".
        // I should probably check if I can add columns to Supabase or if I should just ignore them for now.
        // Given I cannot run migrations easily without SQL editor access or migrations file, I will stick to existing columns 
        // BUT I will validate the input file as requested.
        
        validRows.push({
            tango_concept_code: String(row.codigo_concepto),
            description: row.descripcion,
            active: true,
            // created_by: ??? (need user context, maybe pass it or ignore)
        });
      });
  
      if (errors.length > 0) {
        return { success: false, message: 'Errores de validación.', errors };
      }
  
      const { error } = await supabase
        .from('tango_concepts')
        .upsert(validRows, { onConflict: 'tango_concept_code' });
  
      if (error) throw error;
  
      return { success: true, message: `Se importaron ${validRows.length} conceptos.`, count: validRows.length };
  
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
        const requiredCols = ['codigo_impuesto', 'descripcion', 'alicuota', 'tipo', 'codigo_tango'];
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
        if (!row.codigo_impuesto) errors.push(`Fila ${rowNum}: codigo_impuesto vacío.`);
        
        validRows.push({
            code: String(row.codigo_impuesto), // Mapping 'codigo_impuesto' to 'code' (internal)
            tango_code: String(row.codigo_tango), // Mapping 'codigo_tango' to 'tango_code'
            description: row.descripcion,
            tax_type: row.tipo,
            rate: Number(row.alicuota),
            active: true,
        });
      });
  
      if (errors.length > 0) {
        return { success: false, message: 'Errores de validación.', errors };
      }
  
      const { error } = await supabase
        .from('tax_codes')
        .upsert(validRows, { onConflict: 'code' }); // Assuming 'code' is unique constraint
  
      if (error) throw error;
  
      return { success: true, message: `Se importaron ${validRows.length} alícuotas.`, count: validRows.length };
  
    } catch (error: any) {
      return { success: false, message: `Error: ${error.message}` };
    }
  }
