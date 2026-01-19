import { createClient } from '@supabase/supabase-js';

// Usar variables de entorno directamente si están disponibles, o valores por defecto para prueba local
// Nota: Para este script necesitamos la URL y la SERVICE_ROLE_KEY para poder crear usuarios admin/bypass
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://aaxkcmkbcjstvedwcljl.supabase.co';
// Necesitamos la SERVICE ROLE KEY real para crear usuarios sin confirmación de email
// Si no la tenemos, intentamos con la anon key pero podría fallar o requerir confirmación
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFheGtjbWtiY2pzdHZlZHdjbGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDI4NDUsImV4cCI6MjA4Mzk3ODg0NX0.eoskCdN9ywwhZQd_tegggELX4KwuXnBMkcV9Nn_DfDQ';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Falta configuración de Supabase');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Intentando crear usuario de prueba...');

    const email = 'usuario.prueba.tango@gmail.com';
    const password = 'test1234';

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        if (error.message.includes('already registered')) {
            console.log('⚠️ El usuario test@example.com ya existe. Solo asegúrate de que la contraseña sea "test".');
        } else {
            console.error('❌ Error al crear el usuario:', error.message);
        }
    } else {
        console.log('✅ Usuario creado exitosamente:', data.user?.id);
        console.log('📧 Email:', email);
        console.log('🔑 Password:', password);
        console.log('⚠️ Nota: Si es la primera vez, verifica si requieres confirmar el email en Supabase.');
    }
}

main();
