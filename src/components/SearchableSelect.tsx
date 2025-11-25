import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SearchableSelectProps<T> {
    items: T[];
    selectedId: string | null;
    onSelect: (item: T | null) => void;
    getItemId: (item: T) => string;
    getItemCode: (item: T) => string;
    getItemDescription: (item: T) => string;
    placeholder?: string;
    disabled?: boolean;
    label?: string;
}

export function SearchableSelect<T>({
    items,
    selectedId,
    onSelect,
    getItemId,
    getItemCode,
    getItemDescription,
    placeholder = 'Buscar...',
    disabled = false,
}: SearchableSelectProps<T>) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [filteredItems, setFilteredItems] = useState<T[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedItem = items.find((item) => getItemId(item) === selectedId);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredItems(items.slice(0, 50));
        } else {
            const term = searchTerm.toLowerCase();
            const filtered = items.filter((item) => {
                const code = getItemCode(item).toLowerCase();
                const description = getItemDescription(item).toLowerCase();
                return code.includes(term) || description.includes(term);
            });
            setFilteredItems(filtered.slice(0, 50));
        }
        setHighlightedIndex(0);
    }, [searchTerm, items, getItemCode, getItemDescription]);

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
                    prev < filteredItems.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredItems[highlightedIndex]) {
                    handleSelect(filteredItems[highlightedIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    };

    const handleSelect = (item: T) => {
        onSelect(item);
        setSearchTerm('');
        setIsOpen(false);
    };

    const handleClear = () => {
        onSelect(null);
        setSearchTerm('');
        setIsOpen(false);
    };

    const getDisplayText = () => {
        if (isOpen) return searchTerm;
        if (selectedItem) {
            const code = getItemCode(selectedItem);
            const description = getItemDescription(selectedItem);
            return `${code} - ${description}`;
        }
        return '';
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="relative">
                <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-green-400"
                    size={18}
                />
                <input
                    ref={inputRef}
                    type="text"
                    value={getDisplayText()}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={placeholder}
                    className="w-full pl-10 pr-10 py-3 rounded-lg text-white transition-all"
                    style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                    }}
                />
                {selectedItem && !isOpen && (
                    <button
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-white transition-colors"
                        type="button"
                    >
                        <X size={18} />
                    </button>
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
                        {filteredItems.length === 0 ? (
                            <div className="px-4 py-3 text-center text-green-300">
                                No se encontraron resultados
                            </div>
                        ) : (
                            filteredItems.map((item, index) => {
                                const code = getItemCode(item);
                                const description = getItemDescription(item);
                                return (
                                    <button
                                        key={getItemId(item)}
                                        onClick={() => handleSelect(item)}
                                        onMouseEnter={() => setHighlightedIndex(index)}
                                        className={`w-full px-4 py-3 text-left transition-all ${index === highlightedIndex
                                                ? 'bg-green-600 bg-opacity-30'
                                                : 'hover:bg-green-600 hover:bg-opacity-20'
                                            }`}
                                        type="button"
                                    >
                                        <div className="font-medium text-white">
                                            <span className="text-green-400">{code}</span> - {description}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    {filteredItems.length === 50 && (
                        <div className="px-4 py-2 text-xs text-center text-green-400 border-t border-green-600 border-opacity-30">
                            Mostrando primeros 50 resultados. Refina tu búsqueda para ver más.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
