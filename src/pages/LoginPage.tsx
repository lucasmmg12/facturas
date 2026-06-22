import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, LogIn } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: any) {
      console.error('Error en autenticación:', err);
      
      let errorMessage = 'Ocurrió un error';
      if (err.message) errorMessage = err.message;
      else if (err.error?.message) errorMessage = err.error.message;
      
      if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('Invalid credentials')) {
        errorMessage = 'Email o contraseña incorrectos. Verifica tus credenciales.';
      } else if (errorMessage.includes('Email rate limit exceeded')) {
        errorMessage = 'Demasiados intentos. Por favor, espera unos minutos antes de intentar nuevamente.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = 'Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-neutral-50 overflow-hidden">
      {/* Elementos decorativos de fondo institucionales */}
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-primary-100 rounded-full blur-[100px] opacity-60"></div>
      <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-primary-50 rounded-full blur-[100px] opacity-80"></div>

      <div className="max-w-md w-full relative z-10">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img 
              src="/logosanatorio.png" 
              alt="Sanatorio Argentino" 
              className="h-28 w-auto object-contain"
            />
          </div>
          <h1 className="text-3xl font-black text-neutral-800 mb-2 tracking-tight">
            Acceso al Sistema
          </h1>
          <p className="text-neutral-500 font-medium">
            Gestión de Facturación y Comprobantes
          </p>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="p-8">
            {/* Error message */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100 flex items-start">
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-neutral-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-primary-500" />
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-neutral-50 text-neutral-800 placeholder-neutral-400 border border-neutral-200 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
                  placeholder="usuario@sanatorioargentino.com.ar"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-primary-500" />
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-neutral-50 text-neutral-800 placeholder-neutral-400 border border-neutral-200 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-bold transition-all duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Autenticando...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Iniciar Sesión
                  </>
                )}
              </button>
            </form>
          </div>
          
          <div className="bg-neutral-50 border-t border-neutral-100 p-4 text-center">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              Tecnología desarrollada por Grow Labs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
