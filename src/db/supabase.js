import { createClient } from '@supabase/supabase-js';

// Inicialização lazy: o client só é criado na primeira chamada,
// após o dotenv já ter populado as variáveis de ambiente.
let _supabase = null;
function getClient() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  }
  return _supabase;
}

/**
 * Busca o histórico de conversa de um usuário em determinado canal.
 * Retorna as últimas 20 mensagens para manter contexto sem estourar tokens.
 */
export async function getConversation(phone, channel) {
  const { data, error } = await getClient()
    .from('messages')
    .select('role, content, stage, created_at')
    .eq('phone', phone)
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[Supabase] Erro ao buscar conversa:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Persiste uma mensagem (user ou assistant) no histórico da conversa.
 */
export async function saveMessage(phone, channel, role, content, stage) {
  const { error } = await getClient().from('messages').insert({
    phone,
    channel,
    role,
    content,
    stage,
  });

  if (error) {
    console.error('[Supabase] Erro ao salvar mensagem:', error.message);
  }
}

/**
 * Cria ou atualiza o registro do lead no CRM interno.
 */
export async function saveLead(phone, name, channel, stage) {
  const db = getClient();

  const { data: existing } = await db
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .eq('channel', channel)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from('leads')
      .update({ name, stage, updated_at: new Date().toISOString() })
      .eq('phone', phone)
      .eq('channel', channel);
    if (error) console.error('[Supabase] Erro ao atualizar lead:', error.message);
  } else {
    const { error } = await db
      .from('leads')
      .insert({ phone, name, channel, stage });
    if (error) console.error('[Supabase] Erro ao inserir lead:', error.message);
  }
}

/**
 * Retorna o estágio atual do lead no funil.
 */
export async function getLeadStage(phone, channel) {
  const { data, error } = await getClient()
    .from('leads')
    .select('stage')
    .eq('phone', phone)
    .eq('channel', channel)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Erro ao buscar estágio do lead:', error.message);
    return null;
  }
  return data?.stage || null;
}
