import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el elemento raíz para montar la aplicación.');
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const missingEnvVars = !supabaseUrl || !supabaseAnonKey;

if (missingEnvVars) {
  rootElement.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f9fafb;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 32px;
      box-sizing: border-box;
      text-align: center;
      color: #111827;
    ">
      <div style="
        max-width: 640px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        padding: 40px;
        border: 1px solid #e5e7eb;
      ">
        <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 16px;">
          Configuración de Supabase incompleta
        </h1>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.5;">
          Para ejecutar la aplicación necesitas definir las variables de entorno
          <code style="
            background: #f3f4f6;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 14px;
            margin: 0 4px;
            display: inline-block;
          ">
            VITE_SUPABASE_URL
          </code>
          y
          <code style="
            background: #f3f4f6;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 14px;
            margin: 0 4px;
            display: inline-block;
          ">
            VITE_SUPABASE_ANON_KEY
          </code>
          en un archivo <code>.env</code> o variables del entorno de ejecución.
        </p>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.5; margin-top: 16px;">
          Si estás en local, crea un archivo <code>.env</code> en la raíz del proyecto con:
        </p>
        <pre style="
          background: #111827;
          color: #f9fafb;
          text-align: left;
          padding: 16px;
          border-radius: 8px;
          margin-top: 12px;
          overflow-x: auto;
          font-size: 14px;
        ">VITE_SUPABASE_URL=&lt;tu_url_de_supabase&gt;
VITE_SUPABASE_ANON_KEY=&lt;tu_anon_key&gt;</pre>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.5; margin-top: 16px;">
          Una vez configuradas, reinicia el servidor de desarrollo y la aplicación cargará normalmente.
        </p>
      </div>
    </div>
  `;
} else {
  import('./App')
    .then(({ default: App }) => {
      createRoot(rootElement).render(
        <StrictMode>
          <App />
        </StrictMode>
      );
    })
    .catch((error) => {
      console.error('Error cargando la aplicación:', error);
      rootElement.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: #111827;
          color: #f9fafb;
          padding: 32px;
          box-sizing: border-box;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          text-align: center;
        ">
          <div style="max-width: 640px;">
            <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 16px;">No pudimos iniciar la app</h1>
            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
              Ocurrió un error inesperado al cargar la aplicación. Revisa la consola del navegador para más detalles.
            </p>
            <pre style="
              background: rgba(15, 23, 42, 0.6);
              border: 1px solid rgba(148, 163, 184, 0.4);
              border-radius: 8px;
              padding: 16px;
              font-size: 14px;
              text-align: left;
              overflow-x: auto;
            ">${error instanceof Error ? error.message : String(error)}</pre>
          </div>
        </div>
      `;
    });
}
