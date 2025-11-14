interface Config {
  supabase: {
    url: string;
    anonKey: string;
  };
  openai: {
    apiKey: string | null;
    enabled: boolean;
  };
}

function getEnvVar(key: string, required: boolean = true): string {
  const value = import.meta.env[key];

  if (!value && required) {
    throw new Error(`Variable de entorno faltante: ${key}`);
  }

  return value || '';
}

function validateConfig(): Config {
  const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
  const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
  const openaiApiKey = getEnvVar('VITE_OPENAI_API_KEY', false);

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Configuración de Supabase incompleta. Verifica las variables de entorno.');
  }

  return {
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    },
    openai: {
      apiKey: openaiApiKey || null,
      enabled: !!openaiApiKey,
    },
  };
}

export const config = validateConfig();

export function isOpenAIEnabled(): boolean {
  return config.openai.enabled;
}

export function getOpenAIApiKey(): string {
  if (!config.openai.apiKey) {
    throw new Error('OpenAI API key no está configurada');
  }
  return config.openai.apiKey;
}
