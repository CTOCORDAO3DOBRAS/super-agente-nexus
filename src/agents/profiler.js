const SINAIS = {
  ANALITICO: {
    palavras: ['como funciona','como é','taxa','porcentagem','rendimento','garantia','risco','prazo','contrato','regulação','regulamentado','bacen','detalhe','explica','entender','processo','etapa','passo a passo','quanto tempo','qual a chance','probabilidade','histórico','dado','número','percentual','simulação','planilha','documento','comprova'],
    peso: 2
  },
  EXPRESSIVO: {
    palavras: ['sonho','família','filhos','filho','esposa','marido','futuro','realizar','realização','conquista','conquistar','mérito','mereço','casa própria','minha casa','quero muito','queria muito','sempre quis','incrível','emocionado','animado','ansioso','feliz','orgulho','vida','muda','transforma','mudança','lindo','perfeito','top','amei','adorei','gostei'],
    peso: 2
  },
  PRAGMATICO: {
    palavras: ['quanto custa','valor','preço','parcela','quanto fica','total','prazo','quando','tempo','rápido','logo','agora','hoje','ok','entendi','certo','pode ser','tá','blz','send','próximo passo','como faço','o que preciso','preciso de quê','documentos','quais docs','assinar','fechar'],
    peso: 2
  }
};

function analisarMensagem(mensagem) {
  const texto = mensagem.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const scores = { ANALITICO: 0, EXPRESSIVO: 0, PRAGMATICO: 0 };
  for (const [perfil, config] of Object.entries(SINAIS)) {
    for (const palavra of config.palavras) {
      const palavraNorm = palavra.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (texto.includes(palavraNorm)) scores[perfil] += config.peso;
    }
  }
  if (mensagem.trim().length < 15) scores.PRAGMATICO += 1;
  return scores;
}

function atualizarPerfil(sessao, mensagem) {
  if (!sessao.perfil_scores) {
    sessao.perfil_scores = { ANALITICO: 0, EXPRESSIVO: 0, PRAGMATICO: 0 };
  }
  const delta = analisarMensagem(mensagem);
  sessao.perfil_scores.ANALITICO += delta.ANALITICO;
  sessao.perfil_scores.EXPRESSIVO += delta.EXPRESSIVO;
  sessao.perfil_scores.PRAGMATICO += delta.PRAGMATICO;
  const dominante = Object.entries(sessao.perfil_scores).sort(([,a],[,b]) => b-a)[0][0];
  const total = Object.values(sessao.perfil_scores).reduce((a,b) => a+b, 0);
  sessao.perfil_dominante = total >= 2 ? dominante : 'INDEFINIDO';
  sessao.perfil_confianca = total >= 4 ? 'ALTO' : total >= 2 ? 'MEDIO' : 'BAIXO';
  return sessao;
}

function getInstrucoesPerfil(perfil) {
  const instrucoes = {
    ANALITICO: `PERFIL: ANALÍTICO\n- Use números reais: parcela, taxa 1,20%, prazo, grupo\n- Estruture: "Primeiro... Segundo... Terceiro..."\n- NUNCA pressione para fechar. O dado fala por si\n- Tom: profissional, preciso\n- EVITE: exageros emocionais, hype\n- Argumento forte: segurança jurídica + previsibilidade financeira`,
    EXPRESSIVO: `PERFIL: EXPRESSIVO\n- Conecte ao SONHO: família, lar, conquista, o que representa\n- Use linguagem visual: "imagina acordar na sua casa própria"\n- Histórias de clientes são OURO para este perfil\n- Tom: caloroso, humano, próximo\n- EVITE: frieza, excesso de números logo de cara\n- Argumento forte: realização do sonho + parcela que cabe no orçamento`,
    PRAGMATICO: `PERFIL: PRAGMÁTICO\n- Seja direto: valor, prazo, próximo passo. Sem rodeios\n- Mensagens curtas, uma informação por vez\n- Não repita o que já disse\n- Tom: eficiente, respeitoso do tempo dele\n- EVITE: mensagens longas, repetição, elogios excessivos\n- Argumento forte: custo-benefício objetivo + próximo passo claro`,
    INDEFINIDO: `PERFIL: EM ANÁLISE\n- Linguagem equilibrada: nem técnica demais, nem emocional demais\n- Faça UMA pergunta para revelar o perfil:\n  "Você já conhece como funciona o consórcio?" (detecta Analítico)\n  "Essa conquista é pra você ou tem alguém especial envolvido?" (detecta Expressivo)\n  "Qual fator é mais importante pra você: prazo, parcela ou velocidade?" (detecta Pragmático)`
  };
  return instrucoes[perfil] || instrucoes.INDEFINIDO;
}

function logPerfil(sessao) {
  const s = sessao.perfil_scores || { ANALITICO: 0, EXPRESSIVO: 0, PRAGMATICO: 0 };
  return `[PROFILER] ${sessao.perfil_dominante || 'INDEFINIDO'} | Confiança: ${sessao.perfil_confianca || 'BAIXO'} | A:${s.ANALITICO} E:${s.EXPRESSIVO} P:${s.PRAGMATICO}`;
}

export { atualizarPerfil, getInstrucoesPerfil, logPerfil };
