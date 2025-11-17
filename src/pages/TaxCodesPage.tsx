// Esta página gestiona el catálogo de códigos de impuestos para Tango.
// Permite agregar, editar y activar/desactivar códigos de impuestos.

import { useState, useEffect } from 'react';
import { Plus, Edit, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';

type TaxCode = Database['public']['Tables']['tax_codes']['Row'];

export function TaxCodesPage() {
  const { profile } = useAuth();
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    tango_code: '',
    description: '',
    tax_type: 'IVA',
    rate: '',
    active: true,
  });

  useEffect(() => {
    loadTaxCodes();
  }, []);

  const loadTaxCodes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tax_codes')
        .select('*')
        .order('description');

      if (error) throw error;
      setTaxCodes(data || []);
    } catch (error) {
      console.error('Error loading tax codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile || !formData.code || !formData.tango_code || !formData.description) {
      alert('Código, Código Tango y Descripción son obligatorios');
      return;
    }

    try {
      const rateValue = formData.rate ? parseFloat(formData.rate) : null;

      if (editingId) {
        const { error } = await supabase
          .from('tax_codes')
          .update({
            code: formData.code,
            tango_code: formData.tango_code,
            description: formData.description,
            tax_type: formData.tax_type,
            rate: rateValue,
            active: formData.active,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('tax_codes').insert({
          code: formData.code,
          tango_code: formData.tango_code,
          description: formData.description,
          tax_type: formData.tax_type,
          rate: rateValue,
          active: formData.active,
        });

        if (error) throw error;
      }

      setEditingId(null);
      setShowNewForm(false);
      setFormData({
        code: '',
        tango_code: '',
        description: '',
        tax_type: 'IVA',
        rate: '',
        active: true,
      });
      await loadTaxCodes();
    } catch (error: any) {
      alert('Error al guardar: ' + error.message);
    }
  };

  const handleEdit = (taxCode: TaxCode) => {
    setEditingId(taxCode.id);
    setFormData({
      code: taxCode.code,
      tango_code: taxCode.tango_code,
      description: taxCode.description,
      tax_type: taxCode.tax_type,
      rate: taxCode.rate ? taxCode.rate.toString() : '',
      active: taxCode.active ?? true,
    });
    setShowNewForm(true);
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowNewForm(false);
    setFormData({
      code: '',
      tango_code: '',
      description: '',
      tax_type: 'IVA',
      rate: '',
      active: true,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Códigos de Impuestos</h1>
          <p className="text-gray-600">
            Gestiona los códigos de impuestos para la exportación a Tango
          </p>
        </div>

        <button
          onClick={() => setShowNewForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Nuevo Código</span>
        </button>
      </div>

      {showNewForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Editar Código de Impuesto' : 'Nuevo Código de Impuesto'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código Interno <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: IVA_21"
              />
              <p className="text-xs text-gray-500 mt-1">
                Código único interno del sistema
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código Tango <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.tango_code}
                onChange={(e) => setFormData({ ...formData, tango_code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: IVA21"
              />
              <p className="text-xs text-gray-500 mt-1">
                Código que se exporta a Tango Gestión
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: IVA 21%"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Impuesto <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.tax_type}
                onChange={(e) => setFormData({ ...formData, tax_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="IVA">IVA</option>
                <option value="PERCEPCION">Percepción</option>
                <option value="RETENCION">Retención</option>
                <option value="EXENTO">Exento</option>
                <option value="NO_GRAVADO">No Gravado</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alícuota (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 21.00"
              />
              <p className="text-xs text-gray-500 mt-1">
                Opcional - Solo para impuestos con tasa fija
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Activo</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">
                Solo los códigos activos estarán disponibles para usar
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
            >
              <X className="h-4 w-4" />
              <span>Cancelar</span>
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>Guardar</span>
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Código Interno
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Código Tango
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Descripción
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Alícuota
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {taxCodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No hay códigos de impuestos registrados
                </td>
              </tr>
            ) : (
              taxCodes.map((taxCode) => (
                <tr key={taxCode.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {taxCode.code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {taxCode.tango_code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {taxCode.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {taxCode.tax_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {taxCode.rate ? `${taxCode.rate}%` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {taxCode.active ? (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Activo
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(taxCode)}
                      className="text-blue-600 hover:text-blue-900 inline-flex items-center space-x-1"
                    >
                      <Edit className="h-4 w-4" />
                      <span>Editar</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

