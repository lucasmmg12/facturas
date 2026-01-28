import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Invoice = Database['public']['Tables']['invoices']['Row'];

export interface DashboardStats {
    totalNet: number;
    totalIVA: number;
    invoiceCount: number;
    averageMonthly: number;
    mostIncreasedSupplier: {
        name: string;
        cuit: string;
        increasePercentage: number;
    } | null;
}

export interface SupplierSpend {
    name: string;
    total: number;
    count: number;
}

export interface TimeSeriesData {
    date: string;
    amount: number;
}

export async function getAnalyticsData(period: 'diario' | 'semanal' | 'mensual' | 'anual') {
    const now = new Date();
    let startDate = new Date();

    switch (period) {
        case 'diario':
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'semanal':
            startDate.setDate(now.getDate() - 7);
            break;
        case 'mensual':
            startDate.setMonth(now.getMonth() - 1);
            break;
        case 'anual':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
    }

    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .gte('issue_date', startDate.toISOString())
        .order('issue_date', { ascending: true });

    if (error) throw error;

    return invoices as Invoice[];
}

export async function getDashboardStats(invoices: Invoice[]): Promise<DashboardStats> {
    const totalNet = invoices.reduce((sum, inv) => sum + (inv.net_taxed + inv.net_untaxed + inv.net_exempt), 0);
    const totalIVA = invoices.reduce((sum, inv) => sum + (inv.iva_amount || 0), 0);
    const invoiceCount = invoices.length;

    // Calcular promedio mensual real basado en el rango de los datos
    let averageMonthly = 0;
    if (invoices.length > 0) {
        const firstDate = new Date(invoices[0].issue_date);
        const lastDate = new Date(invoices[invoices.length - 1].issue_date);
        const monthDiff = Math.max(1, (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth()) + 1);
        averageMonthly = totalNet / monthDiff;
    }

    // Proveedor con más aumentos (Comparando promedios de facturas)
    const supplierIncreases = await calculateSupplierIncreases();

    return {
        totalNet,
        totalIVA,
        invoiceCount,
        averageMonthly,
        mostIncreasedSupplier: supplierIncreases[0] || null
    };
}

async function calculateSupplierIncreases() {
    // Obtenemos los últimos 6 meses de datos para calcular aumentos
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: rawInvoices, error } = await supabase
        .from('invoices')
        .select('supplier_name, supplier_cuit, total_amount, issue_date')
        .gte('issue_date', sixMonthsAgo.toISOString())
        .order('issue_date', { ascending: true });

    const invoices = (rawInvoices as any[]) || [];
    if (error) return [];

    const supplierHistory: Record<string, { name: string, prices: number[] }> = {};

    invoices.forEach(inv => {
        if (!supplierHistory[inv.supplier_cuit]) {
            supplierHistory[inv.supplier_cuit] = { name: inv.supplier_name, prices: [] };
        }
        supplierHistory[inv.supplier_cuit].prices.push(inv.total_amount);
    });

    const increases = Object.entries(supplierHistory)
        .map(([cuit, data]) => {
            if (data.prices.length < 2) return null;

            const firstHalf = data.prices.slice(0, Math.floor(data.prices.length / 2));
            const secondHalf = data.prices.slice(Math.floor(data.prices.length / 2));

            const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

            const increase = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;

            return {
                name: data.name,
                cuit,
                increasePercentage: increase
            };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null && item.increasePercentage > 0)
        .sort((a, b) => b.increasePercentage - a.increasePercentage);

    return increases;
}

export function getSpendingBySupplier(invoices: Invoice[]): SupplierSpend[] {
    const spendMap: Record<string, { total: number, count: number }> = {};

    invoices.forEach(inv => {
        const net = inv.net_taxed + inv.net_untaxed + inv.net_exempt;
        if (!spendMap[inv.supplier_name]) {
            spendMap[inv.supplier_name] = { total: 0, count: 0 };
        }
        spendMap[inv.supplier_name].total += net;
        spendMap[inv.supplier_name].count += 1;
    });

    return Object.entries(spendMap)
        .map(([name, data]) => ({
            name,
            total: data.total,
            count: data.count
        }))
        .sort((a, b) => b.total - a.total);
}

export function getTimeSeriesData(invoices: Invoice[], period: string): TimeSeriesData[] {
    const series: Record<string, number> = {};

    invoices.forEach(inv => {
        const date = new Date(inv.issue_date);
        let key = '';

        if (period === 'diario') {
            key = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        } else if (period === 'semanal') {
            // Agrupar por día para que se vea la tendencia de la semana
            key = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        } else if (period === 'mensual') {
            key = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        } else {
            key = date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
        }

        const net = inv.net_taxed + inv.net_untaxed + inv.net_exempt;
        series[key] = (series[key] || 0) + net;
    });

    return Object.entries(series).map(([date, amount]) => ({ date, amount }));
}
