import { useState, useEffect, useCallback, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    AreaChart, Area, PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    TrendingUp, Users, Calendar, DollarSign, Download,
    ChevronUp, ChevronDown, Info, Flame, Target, LucideIcon
} from 'lucide-react';
import {
    getAnalyticsData, getDashboardStats, getSpendingBySupplier, getTimeSeriesData,
    type DashboardStats, type SupplierSpend, type TimeSeriesData
} from '../services/analytics-service';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

type Period = 'diario' | 'semanal' | 'mensual' | 'anual';

const COLORS = ['#00FF88', '#00D1FF', '#FACC15', '#FF3131', '#8B5CF6', '#EC4899'];

interface KPICardProps {
    title: string;
    value: string;
    subtitle: string;
    icon: LucideIcon;
    trend?: { value: number; isUp: boolean };
}

function KPICard({ title, value, subtitle, icon: Icon, trend }: KPICardProps) {
    return (
        <div className="glass-card p-6 relative overflow-hidden group hover:border-grow-neon/50 transition-all duration-500">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-grow-neon/5 blur-3xl rounded-full group-hover:bg-grow-neon/10 transition-all" />
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-grow-muted mb-2">{title}</p>
                    <h3 className="text-3xl font-black text-white tracking-tighter mb-1">{value}</h3>
                    <p className="text-xs text-grow-muted font-bold tracking-wide uppercase">{subtitle}</p>
                </div>
                <div className="bg-grow-neon/10 p-3 rounded-2xl border border-grow-neon/20">
                    <Icon className="w-6 h-6 text-grow-neon" />
                </div>
            </div>
            {trend && (
                <div className={`mt-4 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${trend.isUp ? 'text-red-400' : 'text-grow-neon'}`}>
                    {trend.isUp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {trend.value}% vs Mes ant.
                </div>
            )}
        </div>
    );
}

interface NarrativeItemProps {
    icon: LucideIcon;
    color: string;
    title: string;
    description: string;
}

function NarrativeItem({ icon: Icon, color, title, description }: NarrativeItemProps) {
    return (
        <div className="flex gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}>
                <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
                <h4 className="text-sm font-black text-white uppercase tracking-tight mb-1">{title}</h4>
                <p className="text-xs text-grow-muted leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

export function AnalyticsPage() {
    const [period, setPeriod] = useState<Period>('mensual');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [supplierSpend, setSupplierSpend] = useState<SupplierSpend[]>([]);
    const [timeSeries, setTimeSeries] = useState<TimeSeriesData[]>([]);
    const dashboardRef = useRef<HTMLDivElement>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const invoices = await getAnalyticsData(period);
            const dashboardStats = await getDashboardStats(invoices);
            const spends = getSpendingBySupplier(invoices);
            const series = getTimeSeriesData(invoices, period);

            setStats(dashboardStats);
            setSupplierSpend(spends);
            setTimeSeries(series);
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const downloadPDF = async () => {
        if (!dashboardRef.current) return;
        try {
            const canvas = await html2canvas(dashboardRef.current, {
                backgroundColor: '#000000',
                scale: 2,
                logging: false
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`GASTO_REPORTE_${period.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(val);
    };

    if (loading && !stats) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center">
                <div className="w-12 h-12 border-4 border-grow-neon/20 border-t-grow-neon rounded-full animate-spin mb-6" />
                <p className="text-xs font-black uppercase tracking-[0.3em] text-grow-muted">Sincronizando Inteligencia...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Intelligence Hub</h2>
                    <p className="text-xs text-grow-muted font-bold uppercase tracking-widest mt-2">
                        Análisis predictivo y auditoría de flujo financiero
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex bg-black/40 p-1.5 rounded-full border border-grow-border">
                        {(['diario', 'semanal', 'mensual', 'anual'] as Period[]).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${period === p ? 'bg-grow-neon text-black shadow-neon' : 'text-grow-muted hover:text-white'
                                    }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={downloadPDF}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                        <Download className="w-4 h-4" />
                        Exportar PDF
                    </button>
                </div>
            </div>

            <div ref={dashboardRef} className="space-y-8">
                {/* KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KPICard
                        title="GASTO TOTAL NETO"
                        value={formatCurrency(stats?.totalNet || 0)}
                        subtitle={`${stats?.invoiceCount} Comprobantes`}
                        icon={DollarSign}
                        trend={period === 'mensual' ? { value: 12, isUp: true } : undefined}
                    />
                    <KPICard
                        title="GASTO POR PROVEEDOR"
                        value={supplierSpend[0]?.name || 'N/A'}
                        subtitle={formatCurrency(supplierSpend[0]?.total || 0)}
                        icon={Users}
                    />
                    <KPICard
                        title="PROMEDIO MENSUAL"
                        value={formatCurrency(stats?.averageMonthly || 0)}
                        subtitle="Basado en historial"
                        icon={TrendingUp}
                    />
                    <KPICard
                        title="MAYOR INCREMENTO"
                        value={stats?.mostIncreasedSupplier?.name || 'ESTABLE'}
                        subtitle={stats?.mostIncreasedSupplier ? `+${stats.mostIncreasedSupplier.increasePercentage.toFixed(1)}% de subida` : 'Sin desviaciones'}
                        icon={Flame}
                        trend={stats?.mostIncreasedSupplier ? { value: stats.mostIncreasedSupplier.increasePercentage, isUp: true } : undefined}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Main Chart: Spend Trend */}
                    <div className="glass-card p-8 flex flex-col h-[400px]">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-grow-neon" />
                                    Evolución Temporal de Gastos
                                </h4>
                                <p className="text-[10px] text-grow-muted font-bold uppercase tracking-widest mt-1">
                                    Tendencia de inversión neta por periodo
                                </p>
                            </div>
                            <div className="bg-white/[0.03] px-3 py-1.5 rounded-lg border border-white/5">
                                <p className="text-[9px] font-black text-grow-neon uppercase">Visualización Dinámica</p>
                            </div>
                        </div>

                        <div className="flex-1 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={timeSeries}>
                                    <defs>
                                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#00FF88" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#00FF88" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 700 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 700 }}
                                        tickFormatter={(val) => `$${val > 1000 ? (val / 1000).toFixed(0) + 'k' : val}`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                        labelStyle={{ color: '#9CA3AF', fontSize: '10px', fontWeight: 'bold', marginBottom: '4px' }}
                                        itemStyle={{ color: '#00FF88', fontSize: '12px', fontWeight: 'bold' }}
                                        formatter={(val: number) => [formatCurrency(val), 'Importe']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="amount"
                                        stroke="#00FF88"
                                        strokeWidth={4}
                                        fillOpacity={1}
                                        fill="url(#colorAmount)"
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Secondary Chart: Supplier Split */}
                    <div className="glass-card p-8 flex flex-col h-[400px]">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                    <Target className="w-4 h-4 text-cyan-400" />
                                    Distribución por Proveedores
                                </h4>
                                <p className="text-[10px] text-grow-muted font-bold uppercase tracking-widest mt-1">
                                    Top 5 proveedores con mayor impacto
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 w-full flex items-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={supplierSpend.slice(0, 5)} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={true} vertical={false} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#fff', fontSize: 10, fontWeight: 800 }}
                                        width={120}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                                        contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                        formatter={(val: number) => [formatCurrency(val), 'Invertido']}
                                    />
                                    <Bar
                                        dataKey="total"
                                        radius={[0, 20, 20, 0]}
                                        barSize={20}
                                        animationDuration={2000}
                                    >
                                        {supplierSpend.slice(0, 5).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Narrative Section (Opción C) */}
                <div className="glass-card p-8">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-grow-neon text-black p-2 rounded-lg">
                            <Info className="w-5 h-5 font-black" />
                        </div>
                        <div>
                            <h4 className="text-lg font-black text-white tracking-tight uppercase">Intelligence Narrative</h4>
                            <p className="text-[10px] text-grow-muted font-bold uppercase tracking-widest mt-1">
                                Análisis automático de anomalías y sugerencias tácticas
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NarrativeItem
                            icon={Flame}
                            color="#FF3131"
                            title="Radar de Inflación"
                            description={stats?.mostIncreasedSupplier
                                ? `${stats.mostIncreasedSupplier.name} presenta un aumento del ${stats.mostIncreasedSupplier.increasePercentage.toFixed(1)}% en sus precios promedios este periodo.`
                                : "No se detectaron aumentos significativos de precios en tus proveedores frecuentes este periodo."}
                        />
                        <NarrativeItem
                            icon={TrendingUp}
                            color="#00FF88"
                            title="Tendencia de Inversión"
                            description={`Tu gasto promedio mensual se sitúa en ${formatCurrency(stats?.averageMonthly || 0)}. ${stats?.totalNet && stats.averageMonthly ? (stats.totalNet > stats.averageMonthly ? 'Actualizando: Gastos por encima del promedio.' : 'Optimizado: Gastos bajo el promedio.') : ''}`}
                        />
                        <NarrativeItem
                            icon={Users}
                            color="#00D1FF"
                            title="Concentración de Proveedores"
                            description={supplierSpend.length > 0
                                ? `El ${((supplierSpend[0]?.total / (stats?.totalNet || 1)) * 100).toFixed(0)}% de tu gasto está concentrado en ${supplierSpend[0]?.name}. Considera diversificar si es posible.`
                                : "Aún no hay suficientes datos para calcular la concentración de capital."}
                        />
                        <NarrativeItem
                            icon={Target}
                            color="#FACC15"
                            title="Precisión de Flujo"
                            description={`Has procesado ${stats?.invoiceCount} comprobantes este periodo. La trazabilidad con exportación a Tango es del 100% para los registros auditados.`}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
