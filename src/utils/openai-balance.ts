// Utilidad para rastrear el uso de tokens de OpenAI y estimar el saldo restante
// Almacena el uso acumulado en localStorage

const STORAGE_KEY = 'openai_usage_tracking';
const INITIAL_BALANCE_KEY = 'openai_initial_balance';

interface UsageTracking {
  totalTokens: number;
  totalCost: number;
  lastUpdated: string;
  operations: Array<{
    date: string;
    tokens: number;
    cost: number;
  }>;
}

/**
 * Obtiene el saldo inicial configurado por el usuario
 */
export function getInitialBalance(): number | null {
  const stored = localStorage.getItem(INITIAL_BALANCE_KEY);
  return stored ? parseFloat(stored) : null;
}

/**
 * Establece el saldo inicial
 */
export function setInitialBalance(balance: number): void {
  localStorage.setItem(INITIAL_BALANCE_KEY, balance.toString());
}

/**
 * Registra el uso de tokens de una operación
 */
export function recordTokenUsage(tokens: number, cost: number): void {
  const tracking = getUsageTracking();
  
  tracking.totalTokens += tokens;
  tracking.totalCost += cost;
  tracking.lastUpdated = new Date().toISOString();
  
  tracking.operations.push({
    date: new Date().toISOString(),
    tokens,
    cost,
  });
  
  // Mantener solo las últimas 100 operaciones para no llenar el localStorage
  if (tracking.operations.length > 100) {
    tracking.operations = tracking.operations.slice(-100);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracking));
}

/**
 * Obtiene el tracking de uso
 */
export function getUsageTracking(): UsageTracking {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Si hay error al parsear, crear uno nuevo
    }
  }
  
  return {
    totalTokens: 0,
    totalCost: 0,
    lastUpdated: new Date().toISOString(),
    operations: [],
  };
}

/**
 * Calcula el saldo estimado restante
 */
export function getEstimatedRemainingBalance(): {
  remaining: number | null;
  totalUsed: number;
  initialBalance: number | null;
} {
  const initialBalance = getInitialBalance();
  const tracking = getUsageTracking();
  
  if (initialBalance === null) {
    return {
      remaining: null,
      totalUsed: tracking.totalCost,
      initialBalance: null,
    };
  }
  
  const remaining = initialBalance - tracking.totalCost;
  
  return {
    remaining: Math.max(0, remaining), // No permitir saldo negativo
    totalUsed: tracking.totalCost,
    initialBalance,
  };
}

/**
 * Resetea el tracking de uso (útil para empezar un nuevo período)
 */
export function resetUsageTracking(): void {
  localStorage.removeItem(STORAGE_KEY);
}

