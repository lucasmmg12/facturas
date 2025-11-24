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
        <div 
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{
            borderTopColor: 'rgba(34, 197, 94, 0.8)',
            borderRightColor: 'rgba(34, 197, 94, 0.8)',
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
          }}
        ></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
              Códigos de Impuestos
            </span>
          </h1>
          <p className="text-green-200">
            Gestiona los códigos de impuestos para la exportación a Tango
          </p>
        </div>

        <button
          onClick={() => setShowNewForm(true)}
          className="px-5 py-2.5 text-white rounded-lg flex items-center space-x-2 transition-all duration-300 hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
            boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
          }}
        >
          <Plus className="h-5 w-5" />
          <span className="font-semibold">Nuevo Código</span>
        </button>
      </div>

      {showNewForm && (
        <div 
          className="rounded-xl shadow-2xl p-8"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
          }}
        >
          <h3 className="text-xl font-semibold text-white mb-6">
            {editingId ? 'Editar Código de Impuesto' : 'Nuevo Código de Impuesto'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                Código Interno <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
                placeholder="Ej: IVA_21"
              />
              <p className="text-xs text-green-200 mt-1">
                Código único interno del sistema
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                Código Tango <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.tango_code}
                onChange={(e) => setFormData({ ...formData, tango_code: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
                placeholder="Ej: IVA21"
              />
              <p className="text-xs text-green-200 mt-1">
                Código que se exporta a Tango Gestión
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-green-300 mb-2">
                Descripción <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
                placeholder="Ej: IVA 21%"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                Tipo de Impuesto <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.tax_type}
                onChange={(e) => setFormData({ ...formData, tax_type: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
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
              <label className="block text-sm font-medium text-green-300 mb-2">
                Alícuota (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.rate}
                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
                placeholder="Ej: 21.00"
              />
              <p className="text-xs text-green-200 mt-1">
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
                <span className="text-sm font-medium text-green-300">Activo</span>
              </label>
              <p className="text-xs text-green-200 mt-1 ml-6">
                Solo los códigos activos estarán disponibles para usar
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={handleCancel}
              className="px-5 py-2.5 rounded-lg flex items-center space-x-2 transition-all duration-300 hover:scale-105"
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <X className="h-4 w-4 text-white" />
              <span className="text-white">Cancelar</span>
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-lg flex items-center space-x-2 transition-all duration-300 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(16, 185, 129, 0.8))',
                boxShadow: '0 4px 15px rgba(34, 197, 94, 0.4)',
              }}
            >
              <Save className="h-4 w-4" />
              <span className="text-white font-semibold">Guardar</span>
            </button>
          </div>
        </div>
      )}

      <div 
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
        }}
      >
        <table className="min-w-full">
          <thead style={{ background: 'rgba(0, 0, 0, 0.2)' }}>
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Código Interno
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Código Tango
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Descripción
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Alícuota
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-green-300 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {taxCodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-green-200">
                  No hay códigos de impuestos registrados
                </td>
              </tr>
            ) : (
              taxCodes.map((taxCode) => (
                <tr 
                  key={taxCode.id} 
                  className="transition-all duration-200"
                  style={{
                    borderBottom: '1px solid rgba(34, 197, 94, 0.1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                    {taxCode.code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {taxCode.tango_code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {taxCode.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {taxCode.tax_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {taxCode.rate ? `${taxCode.rate}%` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {taxCode.active ? (
                      <span 
                        className="px-2 py-1 text-xs font-semibold rounded-full"
                        style={{
                          background: 'rgba(34, 197, 94, 0.2)',
                          color: '#86efac',
                          border: '1px solid rgba(34, 197, 94, 0.4)',
                        }}
                      >
                        Activo
                      </span>
                    ) : (
                      <span 
                        className="px-2 py-1 text-xs font-semibold rounded-full"
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          color: '#9ca3af',
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                        }}
                      >
                        Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(taxCode)}
                      className="text-green-400 hover:text-green-300 inline-flex items-center space-x-1 transition-colors"
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

