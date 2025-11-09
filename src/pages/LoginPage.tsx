import { useState, type ChangeEvent, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import {
  Instagram,
  MessageCircle,
  Globe,
  Linkedin,
  Stethoscope,
} from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'No se pudo iniciar sesión. Intenta nuevamente.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-emerald-900 to-gray-900 text-white">
      <div className="flex min-h-screen flex-col">
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.35),transparent_60%)]" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center">
            <div className="flex items-center gap-3 rounded-full border border-white/20 bg-white/5 px-4 py-2 backdrop-blur-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                <img
                  src="/logogrow.png"
                  alt="Grow Labs Logo"
                  className="h-7 w-7 object-contain"
                />
              </div>
              <span className="text-sm font-semibold tracking-[0.4em] text-white/80">
                Grow Labs
              </span>
            </div>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              Plataforma exclusiva para gestionar comprobantes con Tango
            </h1>
            <p className="max-w-2xl text-base text-white/70">
              Accede con tus credenciales para convertir comprobantes en datos listos para importar. OCR,
              validaciones y exportación inteligente en un solo portal.
            </p>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 text-left text-slate-900 shadow-2xl shadow-emerald-900/30">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-emerald-700">Inicia sesión</h2>
              <p className="mt-2 text-sm text-slate-500">
                Ingresa tus credenciales para continuar trabajando con Grow Labs.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-600">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="tu@empresa.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-600">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="********"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? 'Iniciando sesión...' : 'Entrar'}
              </button>
            </form>
          </div>
        </main>

        <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-green-900 text-white py-12 mt-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <img
                    src="/logogrow.png"
                    alt="Grow Labs Logo"
                    className="h-12 w-12 object-contain bg-white rounded-full p-1"
                  />
                  <div>
                    <h3 className="text-2xl font-bold text-white">Grow Labs</h3>
                    <p className="text-green-400 text-sm font-medium">Donde tus ideas crecen</p>
                  </div>
                </div>
                <p className="text-gray-300 mb-4 leading-relaxed">
                  Startup tecnológica especializada en inteligencia artificial y automatización de procesos.
                  Transformamos ideas en soluciones innovadoras para gestión documental y trazabilidad financiera.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://www.instagram.com/growsanjuan/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-gradient-to-br from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <Instagram className="w-5 h-5" />
                    <span className="text-sm font-medium">Instagram</span>
                  </a>
                  <a
                    href="https://api.whatsapp.com/send/?phone=5492643229503&text&type=phone_number&app_absent=0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">WhatsApp</span>
                  </a>
                </div>
                <div className="flex flex-wrap gap-3 mt-3">
                  <a
                    href="https://www.growsanjuan.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <Globe className="w-5 h-5" />
                    <span className="text-sm font-medium">Sitio Web</span>
                  </a>
                  <a
                    href="https://www.linkedin.com/in/lucas-marinero-182521308/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg transition-all shadow-md hover:shadow-lg"
                  >
                    <Linkedin className="w-5 h-5" />
                    <span className="text-sm font-medium">LinkedIn</span>
                  </a>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-green-500/30">
                <h4 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
                  <Stethoscope className="w-6 h-6 text-green-400" />
                  Cliente Exclusivo
                </h4>
                <div className="space-y-2">
                  <p className="text-gray-300 text-sm">
                    Esta plataforma fue desarrollada a medida para automatizar la importación de comprobantes en:
                  </p>
                  <p className="text-xl font-bold text-green-400">Sanatorio Argentino</p>
                  <p className="text-gray-400 text-sm">San Juan, Argentina</p>
                  <div className="mt-4 pt-4 border-t border-gray-600">
                    <p className="text-xs text-gray-400">
                      Sistema de gestión y exportación de comprobantes con integración a Tango Gestión y motores de IA.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-700 pt-6 text-center">
              <p className="text-gray-400 text-sm">
                © 2025 Grow Labs. Todos los derechos reservados. | Powered by IA & Automatización financiera
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

