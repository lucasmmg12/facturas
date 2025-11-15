#!/bin/bash

# Script para desplegar las Edge Functions de Supabase
# Uso: ./deploy.sh [nombre-funcion]

echo "🚀 Desplegando Supabase Edge Functions..."

if [ -z "$1" ]; then
  # Si no se especifica función, desplegar todas
  echo "Desplegando todas las funciones..."
  supabase functions deploy openai-ocr
else
  # Desplegar función específica
  echo "Desplegando función: $1"
  supabase functions deploy $1
fi

echo "✅ Despliegue completado"

# Mostrar logs
echo ""
echo "📊 Para ver los logs en tiempo real, ejecuta:"
echo "   supabase functions logs openai-ocr"

