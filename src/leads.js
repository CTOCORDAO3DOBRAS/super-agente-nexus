import express from 'express';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_PROMPTS = {
  'consorcio-imovel': `Você é o Agente Nexus, especialista em consórcio imobiliário da MLARS Real Estate. MISSÃO: Qualificar o lead e gerar interesse real em avançar para uma proposta formal. REGRAS: Máximo 4 frases por mensagem. Tom: profissional, caloroso, direto. Use emojis com moderação. Sempre termine com uma pergunta de qualificação.`,
  'consorcio-veiculo': `Você é o Agente Nexus, especialista em consórcio de veículos da MLARS. MISSÃO: Qualificar o lead para consórcio de veículo. Tom: dinâmico, objetivo. Máximo 4 frases. Termine sempre com pergunta.`,
  'digital': `Você é o Agente Nexus, especialista em produtos digitais da Nexus Automata. MISSÃO: Qualificar o lead para produtos digitais. Tom: inspirador, acolhedor. Máximo 4 frases. Termine sempre com pergunta.`,
  'slb': `Você é o Agente Nexus, consultor de Sale & Leaseback e M&A da MLARS Real Estate. MISSÃO: Qualificar empresas para operações estruturadas de alto ticket. Tom: executivo, técnico. Máximo 4 frases. Termine sempre com pergunta.`
};

router.get('/consorcio-imovel', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/consorcio-imovel.html'));
});

router.post('/:produto', async (req, res) => {
  const { produto } = req.params;
  const { nome, whatsapp, valor, objetivo, origem } = req.body;
  if (!nome || !whatsapp) return res.status(400).json({ error: 'Nome e WhatsApp obrigatórios' });
  res.json({ success: true });

  try {
    await supabase.from('leads').insert({
      nome, whatsapp: whatsapp.replace(/\D/g, ''), produto,
      valor: valor || null, objetivo: objetivo || null,
      origem: origem || 'landing-page', status: 'novo',
      created_at: new Date().toISOString()
    });
  } catch (err) { console.error('[Supabase]', err.message); }

  try {
    const systemPrompt = AGENT_PROMPTS[produto] || AGENT_PROMPTS['consorcio-imovel'];
    const userContext = `Novo lead: Nome: ${nome} | Produto: ${produto} | Valor: ${valor || 'não informado'} | Objetivo: ${objetivo || 'não informado'}. Gere a primeira mensagem de abordagem para WhatsApp.`;
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20251101', max_tokens: 300,
      system: systemPrompt, messages: [{ role: 'user', content: userContext }]
    });
    const mensagem = completion.content[0].text;
    const numeroFormatado = whatsapp.replace(/\D/g, '');
    const numeroComPais = numeroFormatado.startsWith('55') ? numeroFormatado : `55${numeroFormatado}`;
    await axios.post(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`,
      { phone: numeroComPais, message: mensagem },
      { headers: { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN } }
    );
    await supabase.from('leads').update({ status: 'abordado', primeira_mensagem: mensagem }).eq('whatsapp', numeroFormatado);
    console.log(`[Agente 09] Mensagem enviada para ${nome}`);
  } catch (err) { console.error('[Agente 09]', err.message); }
});

export default router;
