# Sistema de Automatización de Comprobantes para Tango Gestión

## Descripción General

Sistema web completo para automatizar la carga, procesamiento, revisión y exportación de comprobantes de compra destinados a Tango Gestión. Permite subir PDFs e imágenes, extraer datos automáticamente mediante OCR, revisar y corregir información, y generar archivos de importación compatibles con la plantilla oficial de Tango (3 hojas: Encabezados, IVA/Impuestos, Conceptos).

## Características Principales

### 1. Autenticación y Roles
- **CARGA**: Puede subir comprobantes y editar borradores propios
- **REVISION**: Puede revisar, corregir y validar comprobantes
- **EXPORTACION**: Puede generar archivos de exportación para Tango

Registro de auditoría completo de todas las acciones realizadas por cada usuario.

### 2. Gestión de Comprobantes

#### Flujo de Estados
1. **UPLOADED**: Archivo cargado, sin procesar
2. **PROCESSED**: OCR y parsing ejecutados
3. **PENDING_REVIEW**: Campos con baja confianza o incompletos
4. **READY_FOR_EXPORT**: Validado y completo
5. **EXPORTED**: Incluido en archivo generado para Tango
6. **ERROR**: Problemas graves de procesamiento

#### Características de Procesamiento
- Conversión automática de imágenes a PDF
- Soporte para múltiples imágenes de un mismo comprobante
- OCR y extracción inteligente de datos
- Validación de CUIT, totales y campos obligatorios
- Detección automática de duplicados

### 3. Gestión de Proveedores
- Catálogo centralizado de proveedores
- Mapeo a códigos de proveedor en Tango
- Información completa: CUIT, razón social, dirección, condición IVA
- Asociación automática al procesar comprobantes

### 4. Sistema de Conceptos Dinámicos
- No hay conceptos hardcodeados
- Los usuarios pueden agregar nuevos conceptos en tiempo real
- Cada concepto tiene código Tango y descripción
- Autocompletado al asignar conceptos a comprobantes
- Permite distribución flexible de montos por concepto

### 5. Mapeo de Impuestos
- Configuración preestablecida de códigos de impuestos
- IVA: 21%, 10.5%, 27%, 5%, 2.5%
- Exento, No Gravado
- Percepciones: IIBB, IVA, Ganancias
- Mapeo automático a códigos Tango

### 6. Exportación a Tango

#### Formato de Archivo
El sistema genera archivos con 3 secciones claramente delimitadas:

**Hoja 1 - Encabezados:**
- ID Comprobante (interno único)
- Tipo, Punto de Venta, Número
- Fechas (emisión y contable)
- Datos del proveedor (CUIT, razón social, código Tango)
- Importes desglosados (neto gravado, no gravado, exento, IVA, otros impuestos, total)

**Hoja 2 - IVA y Otros Impuestos:**
- ID Comprobante
- Código y descripción del impuesto
- Base imponible
- Importe del impuesto

**Hoja 3 - Conceptos:**
- ID Comprobante
- Código y descripción del concepto
- Importe asignado

#### Control de Exportación
- Solo se exportan comprobantes en estado READY_FOR_EXPORT
- Control de duplicados: no se exporta dos veces el mismo comprobante
- Registro de lotes de exportación (batch)
- Trazabilidad completa: qué, cuándo, quién

### 7. Trazabilidad y Auditoría
- Registro de quién subió cada comprobante
- Registro de modificaciones (quién, cuándo, qué cambió)
- Registro de exportaciones (usuario, fecha, comprobantes incluidos)
- Tabla audit_log para seguimiento detallado

## Arquitectura del Sistema

### Base de Datos (Supabase/PostgreSQL)

#### Tablas Principales
1. **users** - Usuarios y roles
2. **suppliers** - Catálogo de proveedores
3. **files** - Metadata de archivos subidos
4. **invoices** - Comprobantes (encabezados)
5. **invoice_taxes** - Impuestos por comprobante
6. **invoice_concepts** - Conceptos/centros de costo por comprobante
7. **tango_concepts** - Maestro de conceptos dinámicos
8. **tax_codes** - Configuración de códigos de impuestos
9. **export_batches** - Lotes de exportación
10. **audit_log** - Registro de auditoría

#### Seguridad (RLS)
- Todas las tablas con Row Level Security habilitado
- Políticas basadas en roles de usuario
- Control granular de acceso a datos

#### Clave Única de Comprobante
- **internal_invoice_id**: ID interno único generado automáticamente
- **Clave lógica de deduplicación**: CUIT + tipo + punto de venta + número

### Backend Services

#### Archivos de Servicio

**`src/services/ocr-service.ts`**
- Extracción de datos de PDFs mediante OCR
- Parsing de campos: proveedor, tipo, números, fechas, importes, impuestos
- Cálculo de confianza (confidence score)
- Diseñado de forma modular para mejoras futuras

**`src/services/invoice-service.ts`**
- CRUD de comprobantes
- Validación de datos
- Gestión de estados (workflow)
- Detección de duplicados
- Consultas con filtros

**`src/services/tango-export-service.ts`**
- Generación de archivos de exportación
- Formato exacto de plantilla Tango (3 hojas)
- Registro de lotes de exportación
- Marcado de comprobantes como exportados

#### Utilidades

**`src/utils/validators.ts`**
- Validación de CUIT (con dígito verificador)
- Validación de totales e integridad de importes
- Formateo de números y fechas

**`src/utils/file-converter.ts`**
- Conversión de imágenes a PDF
- Soporte para múltiples imágenes
- Manejo de diferentes formatos (JPG, PNG)

**`src/utils/invoice-types.ts`**
- Constantes de tipos de comprobantes
- Mapeo entre códigos AFIP y etiquetas legibles
- Conversión a códigos Tango

**`src/utils/status-labels.ts`**
- Etiquetas y colores para estados
- Presentación consistente en toda la UI

### Frontend (React + TypeScript)

#### Páginas Principales

**`src/pages/LoginPage.tsx`**
- Autenticación con email/password
- Registro de nuevos usuarios con selección de rol
- Integración con Supabase Auth

**`src/pages/DashboardPage.tsx`**
- Dashboard principal con estadísticas
- Navegación entre secciones
- Visualización de métricas clave

**`src/pages/UploadPage.tsx`**
- Drag & drop de archivos
- Procesamiento automático
- Feedback en tiempo real del procesamiento
- Detección de duplicados

**`src/pages/SuppliersPage.tsx`**
- Gestión de proveedores
- CRUD completo
- Mapeo a códigos Tango

**`src/pages/ExportPage.tsx`**
- Lista de comprobantes listos para exportar
- Generación de archivos de importación
- Descarga automática
- Registro de lotes

#### Componentes

**`src/components/InvoiceList.tsx`**
- Lista filtrable de comprobantes
- Búsqueda por múltiples criterios
- Filtros por estado
- Acceso a edición

**`src/components/InvoiceEditor.tsx`**
- Edición completa de comprobantes
- Gestión de conceptos (agregar/eliminar)
- Validación en tiempo real
- Cambio de estados

**`src/components/FileUploader.tsx`**
- Componente reutilizable de subida
- Drag & drop
- Validación de tipos de archivo

**`src/components/AuthGuard.tsx`**
- Protección de rutas
- Control de roles
- Redirección a login

## Uso del Sistema

### 1. Primer Uso

#### Registro
1. Acceder a la aplicación
2. Ir a "Registrarse"
3. Completar: email, contraseña, nombre completo, rol
4. Iniciar sesión

#### Configuración Inicial
- Los códigos de impuestos están precargados
- Los conceptos se crean dinámicamente según necesidad
- Los proveedores se pueden pre-cargar o crear bajo demanda

### 2. Flujo de Trabajo Típico

#### Usuario con Rol CARGA
1. Acceder a "Cargar"
2. Arrastrar archivos (PDFs o imágenes)
3. El sistema procesa automáticamente
4. Ver resultados (éxito, duplicado, error)

#### Usuario con Rol REVISION
1. Ver Dashboard
2. Filtrar por "Pendiente de Revisión"
3. Seleccionar comprobante
4. Revisar y corregir datos:
   - Verificar/corregir proveedor
   - Ajustar importes si es necesario
   - Asignar conceptos (crear nuevos si es necesario)
   - Verificar impuestos
5. Marcar como "Listo para Exportar"

#### Usuario con Rol EXPORTACION
1. Ir a "Exportar"
2. Ver lista de comprobantes listos
3. Verificar totales
4. Click en "Generar Exportación"
5. El archivo se descarga automáticamente
6. Los comprobantes quedan marcados como EXPORTED

### 3. Gestión de Proveedores

#### Agregar Proveedor
1. Ir a "Proveedores"
2. Click en "Nuevo Proveedor"
3. Completar datos (CUIT y Razón Social son obligatorios)
4. Agregar código de proveedor Tango si existe
5. Guardar

#### Mapeo Automático
- Al procesar un comprobante, el sistema busca el CUIT en proveedores
- Si existe, asocia automáticamente y usa el código Tango
- Si no existe, marca el comprobante para revisión manual

### 4. Conceptos Dinámicos

#### Agregar Concepto Nuevo
1. Al editar un comprobante
2. En sección "Conceptos"
3. Click en "Nuevo Concepto"
4. Ingresar:
   - Código Tango del concepto
   - Descripción
5. Guardar
6. El concepto queda disponible para todos los comprobantes

#### Asignar Concepto
1. En editor de comprobante
2. Seleccionar concepto del dropdown
3. Ingresar monto
4. Se puede asignar múltiples conceptos a un comprobante

## Validaciones y Controles

### Validaciones Automáticas
- **CUIT**: Validación con dígito verificador
- **Totales**: Netos + IVA + otros impuestos = Total
- **Fechas**: Formato correcto
- **Duplicados**: CUIT + tipo + PV + número

### Reglas de Negocio
- Un comprobante no puede exportarse dos veces
- Solo comprobantes en READY_FOR_EXPORT se incluyen en exportaciones
- Los conceptos deben sumar al total del comprobante (recomendación)
- Cada archivo subido mantiene vínculo al comprobante para trazabilidad

## Archivos de Código - Guía de Navegación

### Estructura del Proyecto

```
src/
├── components/          # Componentes React reutilizables
│   ├── AuthGuard.tsx
│   ├── FileUploader.tsx
│   ├── InvoiceEditor.tsx
│   ├── InvoiceList.tsx
│   └── StatusBadge.tsx
│
├── contexts/           # Contextos React (Auth)
│   └── AuthContext.tsx
│
├── lib/               # Configuración y tipos
│   ├── database.types.ts
│   └── supabase.ts
│
├── pages/             # Páginas principales
│   ├── DashboardPage.tsx
│   ├── ExportPage.tsx
│   ├── LoginPage.tsx
│   ├── SuppliersPage.tsx
│   └── UploadPage.tsx
│
├── services/          # Lógica de negocio
│   ├── invoice-service.ts
│   ├── ocr-service.ts
│   └── tango-export-service.ts
│
├── utils/             # Utilidades
│   ├── file-converter.ts
│   ├── invoice-types.ts
│   ├── status-labels.ts
│   └── validators.ts
│
├── App.tsx            # Componente raíz
└── main.tsx           # Punto de entrada
```

### Comentarios de Archivo
Todos los archivos incluyen un comentario inicial explicando su propósito:

```typescript
// Este archivo [descripción breve de la funcionalidad]
```

## Extensiones Futuras (No Implementadas)

### Salus (Explícitamente Fuera de Alcance)
- No se implementa integración con Salus en esta versión
- La arquitectura está preparada para agregar esta funcionalidad sin romper el core

### API de Tango
- Actualmente solo se generan archivos de importación
- En el futuro se podría integrar directamente con APIs de Tango

### OCR Avanzado
- El módulo OCR actual es básico
- Se puede mejorar usando servicios externos (Google Vision, AWS Textract, etc.)
- La arquitectura modular permite cambiar el motor OCR sin afectar el resto

### WhatsApp
- No se implementa canal WhatsApp en esta versión
- Solo se trabaja con archivos ya disponibles

## Tecnologías Utilizadas

- **Frontend**: React 18 + TypeScript
- **Estilos**: Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + Auth + Storage)
- **Iconos**: Lucide React
- **Build**: Vite

## Variables de Entorno

```env
VITE_SUPABASE_URL=tu_supabase_url
VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
```

## Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Compilar para producción
npm run build

# Vista previa de producción
npm run preview
```

## Seguridad

### Protección de Datos
- RLS habilitado en todas las tablas
- Autenticación requerida para todas las operaciones
- Políticas basadas en roles

### Privacidad
- No se exponen secretos en el frontend
- Las claves de API están en variables de entorno
- Control de acceso granular por usuario y rol

## Soporte y Mantenimiento

### Logs y Debugging
- Todos los errores se loguean en consola
- La tabla audit_log registra operaciones importantes
- Estados de comprobantes permiten rastrear el flujo

### Mejoras Recomendadas
1. Implementar servicio OCR profesional
2. Agregar notificaciones por email
3. Reportes y estadísticas avanzadas
4. App móvil para captura de fotos
5. Integración directa con API de Tango
6. Backup automático de archivos subidos

---

**Versión**: 1.0
**Fecha**: 2025-01-08
**Autor**: Sistema de Automatización Tango
