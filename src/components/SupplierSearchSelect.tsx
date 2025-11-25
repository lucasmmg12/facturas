import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface Supplier {
    id: string;
    razon_social: string;
    cuit: string;
    tango_supplier_code?: string;
}

interface SupplierSearchSelectProps {
    suppliers: Supplier[];
    selectedSupplierId: string | null;
    onSelect: (supplier: Supplier | null) => void;
    disabled?: boolean;
}

export function SupplierSearchSelect({
    suppliers,
    selectedSupplierId,
    onSelect,
    disabled = false,
}: SupplierSearchSelectProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredSuppliers(suppliers.slice(0, 50)); // Mostrar solo los primeros 50
        } else {
            const term = searchTerm.toLowerCase();
            const filtered = suppliers.filter(
                (s) =>
                    s.razon_social.toLowerCase().includes(term) ||
                    s.cuit.includes(term) ||
                    s.tango_supplier_code?.includes(term)
            );
            setFilteredSuppliers(filtered.slice(0, 50)); // Limitar a 50 resultados
        }
        setHighlightedIndex(0);
    }, [searchTerm, suppliers]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) =>
                    prev < filteredSuppliers.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredSuppliers[highlightedIndex]) {
                    handleSelect(filteredSuppliers[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    const handleSelect = (supplier: Supplier) => {
        onSelect(supplier);
        setSearchTerm('');
        setIsOpen(false);
    };

    const handleClear = () => {
        onSelect(null);
        setSearchTerm('');
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="relative">
                <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                        <Search
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-400"
                            size={18}
                        />
                        <input
                            ref={inputRef}
                            type="text"
                            value={isOpen ? searchTerm : selectedSupplier?.razon_social || ''}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                if (!isOpen) setIsOpen(true);
                            }}
                            onFocus={() => setIsOpen(true)}
                            onKeyDown={handleKeyDown}
                            disabled={disabled}
                            placeholder="Buscar proveedor por nombre o CUIT..."
                            className="w-full pl-10 pr-10 py-3 rounded-lg text-white transition-all"
                            style={{
                                background: 'rgba(0, 0, 0, 0.3)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                            }}
                        />
                        {selectedSupplier && (
                            <button
                                onClick={handleClear}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-white transition-colors"
                                type="button"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {selectedSupplier && (
                    <div className="mt-2 text-sm text-green-300">
                        CUIT: {selectedSupplier.cuit}
                        {selectedSupplier.tango_supplier_code && (
                            <span className="ml-4">Código Tango: {selectedSupplier.tango_supplier_code}</span>
                        )}
                    </div>
                )}
            </div>

            {isOpen && (
                <div
                    className="absolute z-50 w-full mt-2 rounded-lg shadow-2xl overflow-hidden"
                    style={{
                        background: 'rgba(0, 0, 0, 0.95)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        maxHeight: '300px',
                    }}
                >
                    <div className="overflow-y-auto max-h-[300px]">
                        {filteredSuppliers.length === 0 ? (
                            <div className="px-4 py-3 text-center text-green-300">
                                No se encontraron proveedores
                            </div>
                        ) : (
                            filteredSuppliers.map((supplier, index) => (
                                <button
                                    key={supplier.id}
                                    onClick={() => handleSelect(supplier)}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    className={`w-full px-4 py-3 text-left transition-all ${index === highlightedIndex
                                            ? 'bg-green-600 bg-opacity-30'
                                            : 'hover:bg-green-600 hover:bg-opacity-20'
                                        }`}
                                    type="button"
                                >
                                    <div className="font-medium text-white">{supplier.razon_social}</div>
                                    <div className="text-sm text-green-300 mt-1">
                                        CUIT: {supplier.cuit}
                                        {supplier.tango_supplier_code && (
                                            <span className="ml-4">Código: {supplier.tango_supplier_code}</span>
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                    {filteredSuppliers.length === 50 && (
                        <div className="px-4 py-2 text-xs text-center text-green-400 border-t border-green-600 border-opacity-30">
                            Mostrando primeros 50 resultados. Refina tu búsqueda para ver más.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
