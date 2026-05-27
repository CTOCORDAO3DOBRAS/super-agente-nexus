import Anthropic from '@anthropic-ai/sdk';
import {
  getConversation,
  saveMessage,
  saveLead,
  getLeadStage,
} from '../db/supabase.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Estágios do funil de vendas
export const STAGES = {
  QUALIFICACAO: 'QUALIFICACAO',
  OFERTA: 'OFERTA',
  POS_VENDA: 'POS_VENDA',
};

// Instruções base da persona do Nexus
const PERSONA_BASE = `Você é Nexus, um especialista em vendas de produtos digitais.
Você é carismático, empático e extremamente persuasivo — mas nunca agressivo.
Você acredita genuinamente que seus produtos transformam a vida das pessoas.
Sempre escreva de forma natural e conversacional, como numa mensagem de WhatsApp real.
Nunca use linguagem corporativa ou robótica. Use emojis com moderação e naturalidade.
Responda SEMPRE em português do Brasil.`;

// Instruções específicas por estágio do funil
const STAGE_INSTRUCTIONS = {
  [STAGES.QUALIFICACAO]: `
Você está na fase de QUALIFICAÇÃO.
Objetivo: entender o perfil, dores e objetivos do lead.
- Faça perguntas abertas e mostre interesse genuíno
- Identifique a dor principal: o que o está impedindo de ter resultados?
- Colete: nome, objetivo principal, maior desafio atual
- Quando tiver informações suficientes (nome + dor clara), avance para o estágio OFERTA
- Ao decidir avançar, termine sua mensagem com a tag oculta: [AVANÇAR_PARA_OFERTA]
- Seja caloroso e construa rapport antes de qualquer menção a produto`,

  [STAGES.OFERTA]: `
Você está na fase de OFERTA.
Objetivo: apresentar a solução e conduzir ao fechamento.
- Conecte a solução diretamente à dor identificada na qualificação
- Apresente o produto de forma clara: o que é, o que transforma, o que inclui
- Use prova social: mencione resultados de outros alunos/clientes
- Crie urgência real (vagas limitadas, bônus por tempo limitado)
- Antecipe e neutralize objeções (preço, tempo, medo de não funcionar)
- Quando o lead demonstrar intenção de compra clara, avance com: [AVANÇAR_PARA_POS_VENDA]
- Inclua o link de pagamento quando solicitar: {{LINK_PAGAMENTO}}`,

  [STAGES.POS_VENDA]: `
Você está na fase de PÓS-VENDA.
Objetivo: confirmar compra, garantir satisfação e gerar indicações.
- Celebre a decisão do cliente com entusiasmo genuíno
- Passe as instruções de acesso ao produto de forma clara
- Pergunte como foi a experiência e se precisa de suporte
- Em momento oportuno, peça indicações: "conhece alguém que também se beneficiaria?"
- Ofereça upsell apenas se o contexto for natural e o cliente demonstrar satisfação`,
};

/**
 * Processa uma mensagem recebida e retorna a resposta do agente Nexus.
 * Toda a memória da conversa é carregada do Supabase para manter contexto entre sessões.
 */
export async function processMessage(phone, channel, userMessage, userName = null) {
  // Carrega histórico e estágio atual do lead
  const [history, currentStage] = await Promise.all([
    getConversation(phone, channel),
    getLeadStage(phone, channel),
  ]);

  const stage = currentStage || STAGES.QUALIFICACAO;

  // Monta o system prompt com a persona + instruções do estágio atual
  const systemPrompt = `${PERSONA_BASE}

${STAGE_INSTRUCTIONS[stage]}

Canal atual: ${channel}
${userName ? `Nome do contato: ${userName}` : ''}
Estágio atual do funil: ${stage}`;

  // Converte o histórico do banco para o formato da API Anthropic
  const messages = history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Adiciona a mensagem atual do usuário
  messages.push({ role: 'user', content: userMessage });

  // Salva mensagem do usuário no banco
  await saveMessage(phone, channel, 'user', userMessage, stage);

  // Chama a API do Claude com cache de prompt para economizar tokens no system prompt
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        // Cache o system prompt — ele é idêntico para todas as mensagens do mesmo lead no mesmo estágio
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  const assistantMessage = response.content[0].text;

  // Detecta se o agente decidiu avançar o funil
  let nextStage = stage;
  if (assistantMessage.includes('[AVANÇAR_PARA_OFERTA]') && stage === STAGES.QUALIFICACAO) {
    nextStage = STAGES.OFERTA;
  } else if (assistantMessage.includes('[AVANÇAR_PARA_POS_VENDA]') && stage === STAGES.OFERTA) {
    nextStage = STAGES.POS_VENDA;
  }

  // Remove as tags de controle da mensagem final enviada ao usuário
  const cleanMessage = assistantMessage
    .replace(/\[AVANÇAR_PARA_OFERTA\]/g, '')
    .replace(/\[AVANÇAR_PARA_POS_VENDA\]/g, '')
    .trim();

  // Persiste resposta do assistente e atualiza o lead
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
