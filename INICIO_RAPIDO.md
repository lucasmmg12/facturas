# Guía de Inicio Rápido - Sistema Tango

## Usuario de Prueba Creado

Ya existe un usuario en el sistema que puedes usar para comenzar:

**Email:** `lucasmmarinero@gmail.com`
**Contraseña:** La que configuraste al crear tu cuenta en Supabase

## Acceso al Sistema

1. La aplicación estará disponible en tu navegador
2. Verás la pantalla de login
3. Introduce tus credenciales
4. Accederás al dashboard principal

## Permisos de Usuario

**Importante:** Todos los usuarios tienen permisos completos para:
- ✅ Cargar comprobantes (PDFs e imágenes)
- ✅ Revisar y editar comprobantes
- ✅ Gestionar proveedores
- ✅ Crear y asignar conceptos
- ✅ Generar archivos de exportación para Tango

No hay restricciones por roles. Todos pueden hacer todo.

## Flujo de Trabajo Básico

### 1. Cargar un Comprobante

1. Click en **"Cargar"** en el menú superior
2. Arrastra un PDF o imagen de factura
3. El sistema procesará automáticamente:
   - Extrae CUIT, proveedor, números, fechas, importes
   - Valida duplicados
   - Asigna estado inicial

### 2. Revisar el Comprobante

1. En el **Dashboard**, verás el comprobante listado
2. Click en **"Editar"** para abrirlo
3. Revisa y corrige:
   - Datos del proveedor
   - Importes
   - Asigna conceptos (puedes crear nuevos si es necesario)
4. Click en **"Marcar como Listo"** cuando esté validado

### 3. Gestionar Proveedores

1. Click en **"Proveedores"** en el menú
2. **"Nuevo Proveedor"** para agregar uno
3. Completa:
   - CUIT (obligatorio)
   - Razón Social (obligatorio)
   - Código Proveedor Tango (para mapeo)
   - Otros datos opcionales
4. Guardar

**Nota:** Cuando procesas un comprobante, si el CUIT ya existe en proveedores, se asocia automáticamente.

### 4. Exportar a Tango

1. Click en **"Exportar"** en el menú
2. Verás todos los comprobantes en estado "Listo para Exportar"
3. Revisa la lista y el total
4. Click en **"Generar Exportación"**
5. Se descargará un archivo `.txt` con 3 secciones:
   - Encabezados de comprobantes
   - IVA y otros impuestos
   - Conceptos por comprobante

## Características Importantes

### Conversión Automática de Imágenes
- Sube fotos de facturas (JPG, PNG)
- El sistema las convierte automáticamente a PDF
- Luego extrae los datos

### Conceptos Dinámicos
- No hay conceptos predefinidos
- Cuando editas un comprobante, puedes crear conceptos nuevos:
  1. En sección "Conceptos"
  2. Click "Nuevo Concepto"
  3. Ingresa código Tango y descripción
  4. Queda disponible para todos

### Detección de Duplicados
- El sistema detecta si ya existe un comprobante con:
  - Mismo CUIT proveedor
  - Mismo tipo de comprobante
  - Mismo punto de venta
  - Mismo número
- No permite duplicados

### Estados de Comprobante
- **UPLOADED**: Recién cargado
- **PROCESSED**: OCR ejecutado
- **PENDING_REVIEW**: Requiere revisión manual
- **READY_FOR_EXPORT**: Validado y listo
- **EXPORTED**: Ya incluido en una exportación
- **ERROR**: Problema al procesar

## Ejemplo Práctico Paso a Paso

### Caso: Cargar y Exportar una Factura

**Paso 1: Subir**
```
1. Click "Cargar"
2. Arrastra factura-proveedor.pdf
3. Espera procesamiento → Estado: PENDING_REVIEW
```

**Paso 2: Revisar**
```
1. Dashboard → Filtrar "Pendiente de Revisión"
2. Click "Editar" en el comprobante
3. Verificar/corregir datos
4. Agregar proveedor si no existe
5. Asignar concepto (ej: "SERV-001" → "Servicios")
6. Click "Marcar como Listo" → Estado: READY_FOR_EXPORT
```

**Paso 3: Exportar**
```
1. Click "Exportar"
2. Ver comprobante en lista
3. Click "Generar Exportación"
4. Archivo descargado: TANGO_ComprasConceptos_20250108_1430.txt
5. Comprobante → Estado: EXPORTED
```

## Archivo de Exportación

El archivo generado tiene este formato:

```
=== HOJA 1: ENCABEZADOS ===
ID Comprobante,Tipo Comprobante,Punto de Venta,Número,Fecha Emisión,...

=== HOJA 2: IVA Y OTROS IMPUESTOS ===
ID Comprobante,Código Impuesto,Descripción,Base Imponible,Importe

=== HOJA 3: CONCEPTOS ===
ID Comprobante,Código Concepto,Descripción Concepto,Importe
```

Este formato es compatible con la plantilla de importación de Tango Gestión.

## Datos Precargados

El sistema viene con:
- ✅ Códigos de impuestos (IVA 21%, 10.5%, 27%, etc.)
- ✅ Tu usuario ya creado
- ⚠️ **No hay proveedores** - debes crearlos según tu empresa
- ⚠️ **No hay conceptos** - se crean dinámicamente según necesites

## Problemas Comunes

### No puedo iniciar sesión
- Verifica tu email y contraseña
- Si olvidaste la contraseña, usa la opción de recuperación de Supabase

### El OCR no extrae bien los datos
- El OCR actual es básico
- Siempre revisa y corrige manualmente los datos
- El sistema está diseñado para permitir correcciones fáciles

### No aparece el proveedor
- Primero debes crearlo en "Proveedores"
- Luego al procesar comprobantes, se asociará automáticamente por CUIT

### No puedo exportar un comprobante
- Verifica que esté en estado "READY_FOR_EXPORT"
- Si está en "PENDING_REVIEW", edítalo y márcalo como listo

## Próximos Pasos

1. **Cargar proveedores:** Ve a "Proveedores" y crea los principales
2. **Subir comprobantes de prueba:** Usa "Cargar" para probar el flujo
3. **Crear conceptos:** Según tu estructura de centros de costo
4. **Generar primera exportación:** Para probar integración con Tango

## Soporte

Para más información detallada, consulta:
- `SISTEMA_TANGO_DOCS.md` - Documentación completa del sistema
- Revisa los comentarios en el código fuente
- Cada archivo tiene un comentario inicial explicando su función

---

**¡Listo para comenzar!**
