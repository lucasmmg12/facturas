// Esta página gestiona el catálogo de proveedores.
// Permite agregar, editar y mapear proveedores a códigos de Tango.

import { useState, useEffect } from 'react';
import { Plus, Edit, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatCUIT, validateCUIT } from '../utils/validators';
import type { Database } from '../lib/database.types';

type Supplier = Database['public']['Tables']['suppliers']['Row'];

export function SuppliersPage() {
  const { profile } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formData, setFormData] = useState({
    cuit: '',
    razon_social: '',
    tango_supplier_code: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    phone: '',
    email: '',
    iva_condition: '',
  });

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('suppliers')
        .select('*', { count: 'exact' })
        .order('razon_social')
        .range(0, 9999); // Cargar hasta 10,000 proveedores

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile || !formData.cuit || !formData.razon_social) {
      alert('CUIT y Razón Social son obligatorios');
      return;
    }

    if (!validateCUIT(formData.cuit)) {
      alert('CUIT inválido');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('suppliers')
          .update({
            cuit: formData.cuit,
            razon_social: formData.razon_social,
            tango_supplier_code: formData.tango_supplier_code || null,
            address: formData.address || null,
            city: formData.city || null,
            province: formData.province || null,
            postal_code: formData.postal_code || null,
            phone: formData.phone || null,
            email: formData.email || null,
            iva_condition: formData.iva_condition || null,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert({
          cuit: formData.cuit,
          razon_social: formData.razon_social,
          tango_supplier_code: formData.tango_supplier_code || null,
          address: formData.address || null,
          city: formData.city || null,
          province: formData.province || null,
          postal_code: formData.postal_code || null,
          phone: formData.phone || null,
          email: formData.email || null,
          iva_condition: formData.iva_condition || null,
          created_by: profile.id,
        });

        if (error) throw error;
      }

      setEditingId(null);
      setShowNewForm(false);
      setFormData({
        cuit: '',
        razon_social: '',
        tango_supplier_code: '',
        address: '',
        city: '',
        province: '',
        postal_code: '',
        phone: '',
        email: '',
        iva_condition: '',
      });
      await loadSuppliers();
    } catch (error: any) {
      alert('Error al guardar: ' + error.message);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setFormData({
      cuit: supplier.cuit,
      razon_social: supplier.razon_social,
      tango_supplier_code: supplier.tango_supplier_code || '',
      address: supplier.address || '',
      city: supplier.city || '',
      province: supplier.province || '',
      postal_code: supplier.postal_code || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      iva_condition: supplier.iva_condition || '',
    });
    setShowNewForm(true);
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowNewForm(false);
    setFormData({
      cuit: '',
      razon_social: '',
      tango_supplier_code: '',
      address: '',
      city: '',
      province: '',
      postal_code: '',
      phone: '',
      email: '',
      iva_condition: '',
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
              Proveedores
            </span>
          </h1>
          <p className="text-green-200">
            Gestiona el catálogo de proveedores y mapeo a códigos Tango
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
          <span className="font-semibold">Nuevo Proveedor</span>
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
            {editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                CUIT <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.cuit}
                onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
                placeholder="20-12345678-9"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                Razón Social <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.razon_social}
                onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                Código Proveedor Tango
              </label>
              <input
                type="text"
                value={formData.tango_supplier_code}
                onChange={(e) =>
                  setFormData({ ...formData, tango_supplier_code: e.target.value })
                }
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                Condición IVA
              </label>
              <select
                value={formData.iva_condition}
                onChange={(e) => setFormData({ ...formData, iva_condition: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                <option value="">Seleccionar</option>
                <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
                <option value="MONOTRIBUTO">Monotributo</option>
                <option value="EXENTO">Exento</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-green-300 mb-2">Dirección</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">Ciudad</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">Provincia</label>
              <input
                type="text"
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">
                Código Postal
              </label>
              <input
                type="text"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-green-300 mb-2">Teléfono</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-white transition-all"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                }}
              />
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
                CUIT
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Razón Social
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Código Tango
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-green-300 uppercase tracking-wider">
                Condición IVA
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-green-300 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-green-200">
                  No hay proveedores registrados
                </td>
              </tr>
            ) : (
              suppliers.map((supplier) => (
                <tr
                  key={supplier.id}
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
                    {formatCUIT(supplier.cuit)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {supplier.razon_social}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {supplier.tango_supplier_code || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {supplier.iva_condition || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(supplier)}
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
