# Sistema de Automatización de Comprobantes para Tango Gestión

Sistema web completo para automatizar la carga, procesamiento, revisión y exportación de comprobantes de compra destinados a Tango Gestión.

## Características Principales

- 📤 **Carga automática** de PDFs e imágenes con conversión automática
- 🔍 **OCR y extracción** inteligente de datos de comprobantes
- ✅ **Validación automática** de CUIT, totales y detección de duplicados
- 👥 **Gestión de proveedores** con mapeo a códigos Tango
- 📊 **Conceptos dinámicos** creados por usuarios en tiempo real
- 🔄 **Sistema de estados** (workflow) para control de procesamiento
- 📥 **Generación de archivos** de importación compatibles con Tango (3 hojas)
- 🔐 **Sistema multiusuario** con autenticación y auditoría completa
- 📱 **Interfaz moderna** con React + TypeScript + Tailwind CSS

## Tecnologías

- **Frontend**: React 18 + TypeScript + Vite
- **Estilos**: Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + Auth + RLS)
- **Iconos**: Lucide React

## Inicio Rápido

### Requisitos Previos

- Node.js 18+
- Cuenta de Supabase (gratuita)

### Instalación

```bash
# Clonar el repositorio
git clone <tu-repo-url>
cd <nombre-proyecto>

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase
```

### Configurar Supabase

1. Crea un proyecto en [Supabase](https://supabase.com)
2. Copia las credenciales a `.env`:
   ```env
   VITE_SUPABASE_URL=tu_supabase_url
   VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
   ```
3. Ejecuta las migraciones en el SQL Editor de Supabase:
   - `supabase/migrations/20251108222712_create_invoice_management_system.sql`
   - `supabase/migrations/20251108224015_simplify_roles_all_users_full_access.sql`

### Ejecutar en Desarrollo

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

### Compilar para Producción

```bash
npm run build
npm run preview
```

## Documentación

- **[INICIO_RAPIDO.md](INICIO_RAPIDO.md)** - Guía rápida para comenzar a usar el sistema
- **[SISTEMA_TANGO_DOCS.md](SISTEMA_TANGO_DOCS.md)** - Documentación técnica completa

## Flujo de Trabajo

1. **Cargar** - Arrastra PDFs o imágenes de comprobantes
2. **Revisar** - El sistema extrae datos automáticamente, revisa y corrige
3. **Conceptos** - Asigna centros de costo (crea nuevos si es necesario)
4. **Exportar** - Genera archivo de importación para Tango Gestión

## Estructura del Proyecto

```
src/
├── components/     # Componentes React reutilizables
├── contexts/       # Contextos (Auth)
├── lib/           # Configuración y tipos
├── pages/         # Páginas principales
├── services/      # Lógica de negocio
├── utils/         # Utilidades y validadores
└── App.tsx        # Componente raíz

supabase/
└── migrations/    # Migraciones de base de datos
```

## Formato de Exportación

El sistema genera archivos con 3 secciones para importación en Tango:

1. **Encabezados** - Datos principales del comprobante
2. **IVA y Otros Impuestos** - Detalle de impuestos
3. **Conceptos** - Distribución por centros de costo

## Seguridad

- Row Level Security (RLS) habilitado en todas las tablas
- Autenticación requerida para todas las operaciones
- Validaciones de CUIT y totales
- Auditoría completa de todas las acciones

## Usuario de Prueba

Email: `lucasmmarinero@gmail.com`

Todos los usuarios tienen permisos completos para:
- Cargar comprobantes
- Revisar y editar
- Gestionar proveedores
- Generar exportaciones

## Características Avanzadas

- Conversión automática de imágenes a PDF
- Detección de duplicados por CUIT + tipo + punto de venta + número
- Sistema de estados del comprobante (UPLOADED → PROCESSED → PENDING_REVIEW → READY_FOR_EXPORT → EXPORTED)
- OCR modular (fácil de reemplazar con servicios externos)
- Conceptos dinámicos (usuarios pueden crear nuevos en tiempo real)
- Trazabilidad completa de quién hizo qué y cuándo

## Próximas Mejoras

- [ ] Integración con servicios OCR profesionales (Google Vision, AWS Textract)
- [ ] Integración directa con API de Tango
- [ ] App móvil para captura de fotos
- [ ] Notificaciones por email
- [ ] Reportes y estadísticas avanzadas
- [ ] Integración con Salus

## Licencia

MIT

## Autor

Sistema desarrollado para automatización de carga de comprobantes en Tango Gestión.

---

**¿Necesitas ayuda?** Consulta la documentación completa en [SISTEMA_TANGO_DOCS.md](SISTEMA_TANGO_DOCS.md)
