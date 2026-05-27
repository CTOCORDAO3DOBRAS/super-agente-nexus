import Anthropic from '@anthropic-ai/sdk';
import {
  getConversation,
  saveMessage,
  saveLead,
  getLeadStage,
} from '../db/supabase.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const STAGES = {
  QUALIFICACAO: 'QUALIFICACAO',
  OFERTA: 'OFERTA',
  POS_VENDA: 'POS_VENDA',
};

const LINK_ADEMICON = 'https://autorizado.ademicon.com.br/daniel--mattos';

const PERSONA_BASE = `Você é Nexus, assistente virtual do corretor Daniel Mattos, especialista em consórcio Ademicon.
Seu tom é consultivo, educado, direto e sem enrolação.
Escreva em português brasileiro informal mas profissional — como uma mensagem de WhatsApp real.
Nunca use linguagem corporativa, nunca invente valores, prazos ou condições que não foram informados.
Use o nome do lead sempre que souber.
Máximo de 2 perguntas por mensagem. Respostas com no máximo 4 linhas.`;

const STAGE_INSTRUCTIONS = {
  [STAGES.QUALIFICACAO]: `
Você está na etapa de QUALIFICAÇÃO.
Objetivo: coletar nome e objetivo do lead.

Roteiro:
1. Cumprimente e pergunte o nome do lead.
2. Pergunte qual é o objetivo dele: comprar imóvel, adquirir veículo ou investir?
3. Pergunte se já conhece consórcio ou tem alguma dúvida sobre como funciona.

Regra de avanço: quando tiver o nome E o objetivo claramente identificados,
termine sua resposta com a tag: [AVANCAR_PARA_OFERTA]`,

  [STAGES.OFERTA]: `
Você está na etapa de OFERTA.
Objetivo: apresentar o consórcio Ademicon e enviar o link de simulação.

Roteiro:
1. Explique brevemente: consórcio é um jeito de comprar sem juros e sem entrada,
   pagando parcelas que cabem no bolso, com cartas de crédito para imóvel ou veículo.
2. Destaque que Daniel Mattos é especialista e pode montar uma simulação personalizada.
3. Envie o link: ${LINK_ADEMICON}
4. Pergunte se o lead quer simular agora ou se tem alguma dúvida.

Nunca invente valores, taxas ou prazos.

Regra de avanço: quando o lead demonstrar interesse real (pedir simulação, dizer que quer,
perguntar sobre parcelas ou próximos passos), termine com: [AVANCAR_PARA_POS_VENDA]`,

  [STAGES.POS_VENDA]: `
Você está na etapa de PÓS-VENDA.
Objetivo: confirmar acesso ao link, oferecer atendimento direto e pedir para salvar o contato.

Roteiro:
1. Confirme se o lead conseguiu acessar o link e fazer a simulação.
2. Ofereça atendimento direto com Daniel para tirar dúvidas e fechar.
3. Peça para o lead salvar o contato do Daniel na agenda.

Mantenha o tom acolhedor e disponível. Não pressione.`,
};

/**
 * Processa uma mensagem e retorna a resposta do Nexus.
 * O histórico completo é carregado do Supabase a cada turno para manter contexto entre sessões.
 */
export async function processMessage(phone, channel, userMessage, userName = null) {
  const [history, currentStage] = await Promise.all([
    getConversation(phone, channel),
    getLeadStage(phone, channel),
  ]);

  const stage = currentStage || STAGES.QUALIFICACAO;

  const systemPrompt = `${PERSONA_BASE}

${STAGE_INSTRUCTIONS[stage]}

Canal: ${channel}
Estágio atual: ${stage}${userName ? `\nNome do contato: ${userName}` : ''}`;

  const messages = history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
  messages.push({ role: 'user', content: userMessage });

  await saveMessage(phone, channel, 'user', userMessage, stage);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  const assistantMessage = response.content[0].text;

  let nextStage = stage;
  if (assistantMessage.includes('[AVANCAR_PARA_OFERTA]') && stage === STAGES.QUALIFICACAO) {
    nextStage = STAGES.OFERTA;
  } else if (assistantMessage.includes('[AVANCAR_PARA_POS_VENDA]') && stage === STAGES.OFERTA) {
    nextStage = STAGES.POS_VENDA;
  }

  const cleanMessage = assistantMessage
    .replace(/\[AVANCAR_PARA_OFERTA\]/g, '')
    .replace(/\[AVANCAR_PARA_POS_VENDA\]/g, '')
    .trim();

  await Promise.all([
    saveMessage(phone, channel, 'assistant', cleanMessage, nextStage),
    saveLead(phone, userName || phone, channel, nextStage),
  ]);

  return {
    message: cleanMessage,
    stage: nextStage,
    stageChanged: nextStage !== stage,
  };
}
