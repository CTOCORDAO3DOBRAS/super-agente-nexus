import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { atualizarPerfil, getInstrucoesPerfil, logPerfil } from './profiler.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const ESTADOS = {
  TRIGGER: 'TRIGGER', QUALIFICACAO: 'QUALIFICACAO', APRESENTACAO: 'APRESENTACAO',
  ANCORAGEM: 'ANCORAGEM', OBJECAO: 'OBJECAO', FECHAMENTO: 'FECHAMENTO',
  POS_VENDA: 'POS_VENDA', PERDIDO: 'PERDIDO'
};

const IMOVEIS = {
  aldeota: { nome: 'Aldeota 4 Suítes', valor: 1490000, credito: 1900000, parcelaReduzida: 6408.72, parcelaIntegral: 10725.56, grupo: '12183', prazo: 220 },
  skyview: { nome: 'Skyview Dunas Vista Mar', valor: 6400000, credito: 8000000, parcelaReduzida: 28928, parcelaIntegral: 45368, grupo: '12176', prazo: 219 }
};

function gerarPromptSistema(sessao, imovel) {
  const instrucoesPerfil = getInstrucoesPerfil(sessao.perfil_dominante || 'INDEFINIDO');
  const imovelInfo = imovel ? `\nIMÓVEL DE INTERESSE:\n- Nome: ${imovel.nome}\n- Valor: R$ ${imovel.valor.toLocaleString('pt-BR')}\n- Crédito MLARS Consórcios: R$ ${imovel.credito.toLocaleString('pt-BR')}\n- Parcela reduzida (pré-contemplação): R$ ${imovel.parcelaReduzida.toLocaleString('pt-BR')}/mês\n- Parcela integral: R$ ${imovel.parcelaIntegral.toLocaleString('pt-BR')}/mês\n- Grupo: ${imovel.grupo} | Prazo: ${imovel.prazo} meses` : '';
  return `Você é Daniel, consultor especialista em consórcios imobiliários da MLARS Consórcios.

IDENTIDADE E VOZ:
- Você é homem. SEMPRE use linguagem masculina: "vou ser honesto", "estou disponível", "fico à disposição".
- NUNCA use concordâncias femininas.
- Tom: próximo, humano, confiante. NUNCA robótico.
- NUNCA mencione Ademicon. Sempre: MLARS Consórcios.

ESTADO: ${sessao.estado} | Lead: ${sessao.nome || 'Lead'} | Msgs: ${sessao.historico ? sessao.historico.length : 0}

${instrucoesPerfil}

ENGENHARIA DE ASSENTIMENTO (antes do fechamento, colete 2 "sins"):
1. "Faz sentido ter poder de compra à vista na hora de negociar?"
2. "Pagar menos que aluguel pra construir patrimônio é vantajoso, concorda?"
3. "Se a parcela couber no orçamento, faria sentido dar esse passo?"

ARGUMENTOS FUNDAMENTAIS:
1. PARCELA REDUZIDA: Pré-contemplação = ~50% do valor cheio. Menos que aluguel.
2. SEM ENTRADA: Contemplação por sorteio ou lance.
3. SEGURANÇA: Regulamentado pelo Banco Central (Lei 11.795/2008).
4. PODER DE COMPRA À VISTA: Negocia o imóvel à vista na contemplação.
${imovelInfo}

REGRAS DE OURO:
- NUNCA coloque prazo de validade. Sempre: "Verificar disponibilidade de grupos e cotas no ato da contratação."
- NUNCA mencione Ademicon.
- Máximo 3 parágrafos por mensagem. Prefira mensagens curtas.
- UMA pergunta por vez.`;
}

async function processarMensagem(telefone, mensagemLead, dadosLead = {}) {
  try {
    let sessao = await buscarSessao(telefone);
    if (!sessao) sessao = criarSessao(telefone, dadosLead);

    sessao = atualizarPerfil(sessao, mensagemLead);
    console.log(logPerfil(sessao));

    sessao.historico = sessao.historico || [];
    sessao.historico.push({ role: 'user', content: mensagemLead });

    if (detectarPedidoHumano(mensagemLead)) {
      await salvarSessao(sessao);
      return { resposta: 'Entendido! Vou te passar para nosso especialista agora. Ele vai continuar o atendimento com você. 👋', transferir: true };
    }

    const imovel = detectarImovel(sessao, dadosLead);
    sessao.estado = calcularProximoEstado(sessao, mensagemLead);
    const promptSistema = gerarPromptSistema(sessao, imovel);
    const resposta = await chamarClaude(promptSistema, sessao.historico);

    sessao.historico.push({ role: 'assistant', content: resposta });
    sessao.ultima_interacao = new Date().toISOString();
    sessao.followup_2h_enviado = sessao.followup_2h_enviado || false;
    sessao.followup_24h_enviado = sessao.followup_24h_enviado || false;
    sessao.followup_72h_enviado = sessao.followup_72h_enviado || false;

    await salvarSessao(sessao);
    return { resposta, transferir: false };
  } catch (error) {
    console.error('[CLOSER] Erro:', error);
    throw error;
  }
}

async function verificarFollowUps(enviarWhatsApp) {
  const { data: sessoes, error } = await supabase
    .from('sessoes_closer').select('*')
    .neq('estado', 'FECHAMENTO').neq('estado', 'POS_VENDA').neq('estado', 'PERDIDO');
  if (error) { console.error('[FOLLOW-UP] Erro:', error); return; }

  const agora = new Date();
  for (const sessao of sessoes) {
    const horas = (agora - new Date(sessao.ultima_interacao)) / 3600000;
    const nome = sessao.nome ? sessao.nome.split(' ')[0] : 'você';
    const p = sessao.perfil_dominante || 'INDEFINIDO';

    if (horas >= 2 && !sessao.followup_2h_enviado) {
      const msgs = { ANALITICO: `${nome}, ficou alguma dúvida técnica? Estou por aqui. 👌`, EXPRESSIVO: `${nome}, esse passo pode mudar muita coisa pra você e pra família. Ficou alguma dúvida? 🏠`, PRAGMATICO: `${nome}, ficou alguma dúvida? Me fala.`, INDEFINIDO: `${nome}, ficou alguma dúvida? Estou disponível.` };
      await enviarWhatsApp(sessao.telefone, msgs[p] || msgs.INDEFINIDO);
      await supabase.from('sessoes_closer').update({ followup_2h_enviado: true }).eq('telefone', sessao.telefone);
      console.log(`[FOLLOW-UP] +2h → ${sessao.telefone}`);
    } else if (horas >= 24 && !sessao.followup_24h_enviado) {
      const msgs = { ANALITICO: `${nome}, posso te passar os dados de contemplação do grupo que avaliamos, se quiser.`, EXPRESSIVO: `${nome}, uma cliente minha estava em dúvida como você... hoje me mandou foto da família na casa nova. Você merece isso também. 🙏`, PRAGMATICO: `${nome}, posso te mandar um resumo rápido do que conversamos?`, INDEFINIDO: `${nome}, quero garantir que você tenha todas as informações pra tomar a melhor decisão.` };
      await enviarWhatsApp(sessao.telefone, msgs[p] || msgs.INDEFINIDO);
      await supabase.from('sessoes_closer').update({ followup_24h_enviado: true }).eq('telefone', sessao.telefone);
      console.log(`[FOLLOW-UP] +24h → ${sessao.telefone}`);
    } else if (horas >= 72 && !sessao.followup_72h_enviado) {
      const msgs = { ANALITICO: `${nome}, deixo as informações à disposição. Qualquer dúvida futura, pode me chamar. Sucesso! 🤝`, EXPRESSIVO: `${nome}, fica à vontade. Quando o momento certo chegar, a gente conversa. Cuida-se! 🙏`, PRAGMATICO: `${nome}, tudo bem. Se precisar no futuro, só chamar.`, INDEFINIDO: `${nome}, deixo o canal aberto. Qualquer dúvida futura, é só me chamar. 👋` };
      await enviarWhatsApp(sessao.telefone, msgs[p] || msgs.INDEFINIDO);
      await supabase.from('sessoes_closer').update({ followup_72h_enviado: true, estado: 'PERDIDO' }).eq('telefone', sessao.telefone);
      console.log(`[FOLLOW-UP] +72h → ${sessao.telefone} — PERDIDO`);
    }
  }
}

async function reativarLeadsPerdidos(enviarWhatsApp) {
  const { data: leads, error } = await supabase.from('sessoes_closer').select('*').eq('estado', 'PERDIDO');
  if (error) { console.error('[REATIVACAO] Erro:', error); return; }

  const agora = new Date();
  for (const lead of leads) {
    const dias = (agora - new Date(lead.ultima_interacao)) / 86400000;
    const nome = lead.nome ? lead.nome.split(' ')[0] : 'você';
    let mensagem = null, campo = null;

    if (dias >= 30 && dias < 31 && !lead.reativacao_30d) {
      mensagem = `${nome}, tudo bem? Passado um mês, queria checar se ainda tem interesse em realizar esse sonho. Os grupos continuam ativos. Se quiser conversar sem compromisso, estou à disposição. 🏠`;
      campo = 'reativacao_30d';
    } else if (dias >= 60 && dias < 61 && !lead.reativacao_60d) {
      mensagem = `${nome}, como você está? Surgiram grupos novos com condições interessantes. Se quiser dar uma olhada, mando os detalhes. Sem pressão! 😊`;
      campo = 'reativacao_60d';
    } else if (dias >= 90 && dias < 91 && !lead.reativacao_90d) {
      mensagem = `${nome}, faz 3 meses desde nossa conversa. Se o sonho da casa própria ainda estiver nos planos, sabe onde me encontrar. Cuida-se! 🙏`;
      campo = 'reativacao_90d';
    }

    if (mensagem && campo) {
      await enviarWhatsApp(lead.telefone, mensagem);
      await supabase.from('sessoes_closer').update({ [campo]: true }).eq('telefone', lead.telefone);
      console.log(`[REATIVACAO] ${campo} → ${lead.telefone}`);
    }
  }
}

function criarSessao(telefone, dadosLead) {
  return { telefone, nome: dadosLead.nome || null, email: dadosLead.email || null, imovel_interesse: dadosLead.imovel || null, estado: ESTADOS.TRIGGER, historico: [], perfil_scores: { ANALITICO: 0, EXPRESSIVO: 0, PRAGMATICO: 0 }, perfil_dominante: 'INDEFINIDO', perfil_confianca: 'BAIXO', ultima_interacao: new Date().toISOString(), followup_2h_enviado: false, followup_24h_enviado: false, followup_72h_enviado: false, reativacao_30d: false, reativacao_60d: false, reativacao_90d: false, criado_em: new Date().toISOString() };
}

async function buscarSessao(telefone) {
  const { data, error } = await supabase.from('sessoes_closer').select('*').eq('telefone', telefone).single();
  if (error || !data) return null;
  return data;
}

async function salvarSessao(sessao) {
  const { error } = await supabase.from('sessoes_closer').upsert(sessao, { onConflict: 'telefone' });
  if (error) { console.error('[CLOSER] Erro ao salvar:', error); throw error; }
}

function detectarImovel(sessao, dadosLead) {
  const i = (sessao.imovel_interesse || dadosLead.imovel || '').toLowerCase();
  if (i.includes('aldeota')) return IMOVEIS.aldeota;
  if (i.includes('skyview') || i.includes('dunas')) return IMOVEIS.skyview;
  return null;
}

function detectarPedidoHumano(msg) {
  return ['falar com humano','falar com pessoa','atendente','consultor','pessoa real','não quero robô','me liga'].some(s => msg.toLowerCase().includes(s));
}

function calcularProximoEstado(sessao, mensagemLead) {
  const e = sessao.estado;
  const txt = mensagemLead.toLowerCase();
  const n = sessao.historico ? sessao.historico.length : 0;
  if (e === 'TRIGGER') return 'QUALIFICACAO';
  if (e === 'QUALIFICACAO' && n >= 4) return 'APRESENTACAO';
  if (e === 'APRESENTACAO' && n >= 6) {
    if (['caro','pensar','depois','não sei','dúvida','medo','risco'].some(s => txt.includes(s))) return 'OBJECAO';
    return 'ANCORAGEM';
  }
  if (e === 'OBJECAO') return 'ANCORAGEM';
  if (['quero','vamos','pode ser','fecha','assinar','contratar','topei'].some(s => txt.includes(s))) return 'FECHAMENTO';
  return e;
}

async function chamarClaude(systemPrompt, historico) {
  const response = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 500, system: systemPrompt, messages: historico.slice(-10) });
  return response.content[0].text;
}

export { processarMensagem, verificarFollowUps, reativarLeadsPerdidos, ESTADOS, IMOVEIS };
