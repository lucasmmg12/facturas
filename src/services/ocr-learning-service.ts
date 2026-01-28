import { supabase } from '../lib/supabase';

/**
 * Registra una corrección manual realizada por el usuario para alimentar
 * el sistema de aprendizaje adaptativo del OCR.
 */
export async function recordCorrection(
    supplierCuit: string,
    originalData: any,
    correctedData: any,
    userId: string
) {
    if (!originalData || !correctedData || !supplierCuit) return;

    // Limpiar CUIT (solo números) para consistencia
    const cleanCuit = supplierCuit.replace(/\D/g, '');

    try {
        const { error } = await (supabase
            .from('ocr_learning_data') as any)
            .insert({
                supplier_cuit: cleanCuit,
                original_data: originalData,
                corrected_data: correctedData,
                created_by: userId
            });

        if (error) {
            console.error('[OCR Learning] Error al registrar corrección:', error);
        } else {
            console.log(`[OCR Learning] Corrección registrada para proveedor ${cleanCuit}`);
        }
    } catch (e) {
        console.error('[OCR Learning] Excepción al registrar corrección:', e);
    }
}

/**
 * Obtiene los "hints" de aprendizaje para un CUIT específico.
 * Estos hints se pueden pasar al prompt de OpenAI.
 */
export async function getLearningHints(supplierCuit: string): Promise<string | null> {
    const cleanCuit = supplierCuit.replace(/\D/g, '');

    const { data, error } = await (supabase
        .from('ocr_learning_data') as any)
        .select('original_data, corrected_data')
        .eq('supplier_cuit', cleanCuit)
        .order('created_at', { ascending: false })
        .limit(3);

    if (error || !data || data.length === 0) return null;

    // Generar un resumen de las correcciones
    const hints = data.map((item: any, index: number) => {
        return `Ejemplo ${index + 1}: Anteriormente leíste mal algunos campos. El usuario corrigió los datos finales de esta forma: ${JSON.stringify(item.corrected_data)}`;
    }).join('\n');

    return hints;
}
