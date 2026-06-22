const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export async function safeJson(response: Response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw new Error('Respuesta inválida'); }
}

function getLocal(key: string, def: any) {
    const v = localStorage.getItem('simon_' + key);
    return v ? JSON.parse(v) : def;
}
function setLocal(key: string, val: any) {
    localStorage.setItem('simon_' + key, JSON.stringify(val));
}

const SYSTEM_PROMPT = `Sos Simon IA, el Auditor Inteligente del Sanatorio Argentino.
Sos un experto absoluto en el sistema de Facturación. Este sistema tiene las siguientes características:
- Módulo de "Carga Automática" que usa OCR para leer comprobantes y extraer CUIT, Monto y Fecha.
- Módulo de "Revisión y Auditoría" donde los auditores revisan discrepancias de montos o datos faltantes.
- "Exportación a Tango" que genera el archivo txt compatible con Tango Gestión.
- Módulo de "Maestros" (Proveedores, Códigos de Retención, etc).
Respondé las dudas del usuario siempre con un tono profesional, amable y clínico (estilo Sanatorio Argentino).
Tus respuestas deben ser concisas y formateadas en Markdown.`;

export async function sendRAGMessage(question: string, conversationId: string | null = null) {
    let convs = getLocal('conversations', []);
    let conv = convs.find((c: any) => c.id === conversationId);
    
    if (!conv) {
        conv = { id: Date.now().toString(), title: question.substring(0, 30) + '...', updated_at: new Date().toISOString(), messages: [] };
        convs.push(conv);
    }
    
    conv.messages.push({ role: 'user', content: question, created_at: new Date().toISOString() });
    
    const messagesForOpenAI = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conv.messages.map((m: any) => ({ role: m.role, content: m.content }))
    ];

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_API_KEY },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: messagesForOpenAI })
        });
        
        if (!response.ok) throw new Error('Error de OpenAI');
        const data = await response.json();
        const answer = data.choices[0].message.content;
        
        conv.messages.push({ role: 'assistant', content: answer, created_at: new Date().toISOString(), sources: [] });
        conv.updated_at = new Date().toISOString();
        setLocal('conversations', convs);
        
        return { conversation_id: conv.id, answer: answer, sources: [], type: 'direct' };
    } catch (e: any) {
        throw new Error(e.message || 'Error de conexión con OpenAI');
    }
}

export async function listRAGConversations() { return { conversations: getLocal('conversations', []) }; }
export async function getRAGConversationMessages(id: string) {
    const conv = getLocal('conversations', []).find((c: any) => c.id === id);
    return { messages: conv ? conv.messages : [] };
}
export async function deleteRAGConversation(id: string) {
    setLocal('conversations', getLocal('conversations', []).filter((c: any) => c.id !== id));
    return { status: 'ok' };
}

export async function uploadRAGDocument() { return { total_chunks: 1 }; }
export async function uploadRAGBatch() { return { processed: 0, failed: 0, skipped: 0, total_chunks: 0, results: [] }; }
export async function listRAGFiles() { return { items: [], total_files: 0 }; }
export async function downloadRAGFile() { return {}; }
export async function createRAGFolder() { return {}; }
export async function deleteRAGFile() { return {}; }
export async function deleteRAGFolder() { return {}; }
export async function listRAGRules() { return { rules: [] }; }
export async function createRAGRule() { return {}; }
export async function deleteRAGRule() { return {}; }
export async function submitRAGFeedback() { return {}; }
export async function fetchRAGAnalytics() { return { total_queries: 0, accuracy: 0, popular_topics: [] }; }
export async function fetchLearningStats() { return { total_learned: 42 }; }
export async function checkRAGHealth() { return true; }
export async function fetchSuggestions() {
    return { 
        categories: [{name: 'Carga Automática', count: 5}, {name: 'Exportar a Tango', count: 3}],
        top_queries: [{text: '¿Cómo funciona la carga automática de facturas?'}, {text: '¿Cómo exporto un lote a Tango?'}]
    };
}
