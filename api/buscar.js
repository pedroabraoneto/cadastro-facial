export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.PACTO_API_KEY;
  const EMPRESA_ID = process.env.PACTO_EMPRESA_ID || '1';
  const BASE_URL = 'https://apigw.pactosolucoes.com.br';
  const headers = { 'Authorization': 'Bearer ' + API_KEY, 'empresaId': EMPRESA_ID };

  // GET = buscar por CPF
  if (req.method === 'GET') {
    const { cpf } = req.query;
    if (!cpf) return res.status(400).json({ erro: 'CPF obrigatorio' });
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) return res.status(400).json({ erro: 'CPF invalido' });

    try {
      // Step 1: Buscar via /clientes/simplificado
      const respSimp = await fetch(`${BASE_URL}/clientes/simplificado?cpf=${cpfLimpo}`, { headers });
      const dataSimp = await respSimp.json();
      const simpContent = dataSimp.content || [];

      if (simpContent.length === 0) {
        return res.status(404).json({ erro: 'Cliente nao encontrado', existe: false });
      }

      const matricula = String(simpContent[0].codigoMatricula).padStart(6, '0');

      // Step 2: Buscar dados completos
      const filters = encodeURIComponent(JSON.stringify({ documento: cpfLimpo, empresa: parseInt(EMPRESA_ID) }));
      const respFull = await fetch(`${BASE_URL}/cadastro-cliente/consultar?filters=${filters}&page=0&size=1`, { headers });
      const dataFull = await respFull.json();

      if (dataFull.content && dataFull.content.length > 0) {
        const c = dataFull.content[0];
        return res.status(200).json({
          existe: true,
          pessoa: c.pessoa,
          cliente: c.cliente,
          nome: c.nome,
          matricula: c.matricula || matricula,
          urlFoto: c.urlFoto || null,
          situacao: c.situacao,
          cpf: c.cpf,
          telefone: c.telefone || '',
          email: c.email || '',
          dataNascimento: c.dataNascimento || ''
        });
      }

      return res.status(200).json({
        existe: true,
        matricula: matricula,
        nome: simpContent[0].nome,
        situacao: simpContent[0].situacaoDescricao === 'Ativo' ? 'AT' : 'VI'
      });
    } catch (err) {
      return res.status(500).json({ erro: 'Erro ao consultar: ' + err.message });
    }
  }

  // POST = cadastrar novo OU atualizar existente
  if (req.method === 'POST') {
    const { cpf, nome, telefone, dataNascimento, sexo, email } = req.body;
    if (!cpf || !nome) return res.status(400).json({ erro: 'CPF e nome sao obrigatorios' });

    const cpfLimpo = cpf.replace(/\D/g, '');
    const telLimpo = telefone ? telefone.replace(/\D/g, '') : '';

    // VALIDACAO ANTI-PLACEHOLDER
    if (telLimpo && (telLimpo.includes('99999999') || telLimpo.includes('00000000'))) {
      return res.status(400).json({ erro: 'Telefone invalido. Use um numero real.' });
    }
    if (telLimpo && telLimpo.length < 10) {
      return res.status(400).json({ erro: 'Telefone deve ter DDD + numero (min 10 digitos)' });
    }

    try {
      // 1. Buscar se CPF ja existe
      const filters = encodeURIComponent(JSON.stringify({ documento: cpfLimpo, empresa: parseInt(EMPRESA_ID) }));
      const respBusca = await fetch(`${BASE_URL}/cadastro-cliente/consultar?filters=${filters}&page=0&size=1`, { headers });
      const dataBusca = await respBusca.json();

      if (dataBusca.content && dataBusca.content.length > 0) {
        // EXISTE — retornar dados (nao duplicar)
        const existente = dataBusca.content[0];
        return res.status(200).json({
          existe: true,
          atualizado: true,
          pessoa: existente.pessoa,
          cliente: existente.cliente,
          nome: existente.nome,
          matricula: existente.matricula,
          urlFoto: existente.urlFoto || null,
          situacao: existente.situacao
        });
      }

      // NAO EXISTE — cadastrar novo
      const params = new URLSearchParams({
        nome: nome.toUpperCase(),
        cpf: cpfLimpo,
        dataNascimento: dataNascimento || '',
        sexo: sexo || 'M',
        telCelular: telLimpo || '',
        empresa: EMPRESA_ID,
        email: email || 'nao@informado.com',
        endereco: '.', cidade: 'GOIANIA', bairro: '.', cep: '74150020', uf: 'GO', numero: '0',
        senha: cpfLimpo.substring(0, 6)
      });

      const respNovo = await fetch(`${BASE_URL}/cliente/cadastrarCliente?${params.toString()}`, {
        method: 'POST', headers
      });

      let dataNovo;
      const textNovo = await respNovo.text();
      try { dataNovo = JSON.parse(textNovo); } catch (e) {
        if (respNovo.ok) dataNovo = { resultado: textNovo };
        else return res.status(500).json({ erro: 'Erro API: ' + textNovo.substring(0, 200) });
      }

      if (dataNovo.erro) {
        if (dataNovo.erro.includes('CPF') && dataNovo.erro.includes('cadastrado')) {
          const recheck = await fetch(`${BASE_URL}/cadastro-cliente/consultar?filters=${filters}&page=0&size=1`, { headers });
          const recheckData = await recheck.json();
          if (recheckData.content && recheckData.content.length > 0) {
            const c = recheckData.content[0];
            return res.status(200).json({
              existe: true, atualizado: true, pessoa: c.pessoa, cliente: c.cliente,
              nome: c.nome, matricula: c.matricula, situacao: c.situacao
            });
          }
        }
        return res.status(500).json({ erro: dataNovo.erro });
      }

      // Re-check para dados completos
      if (typeof dataNovo.resultado === 'string' && /^\d+$/.test(dataNovo.resultado.trim())) {
        const recheck2 = await fetch(`${BASE_URL}/cadastro-cliente/consultar?filters=${filters}&page=0&size=1`, { headers });
        const recheckData2 = await recheck2.json();
        if (recheckData2.content && recheckData2.content.length > 0) {
          const c = recheckData2.content[0];
          return res.status(200).json({
            criado: true, matricula: c.matricula, pessoa: c.pessoa,
            cliente: c.cliente, nome: c.nome, situacao: c.situacao
          });
        }
      }

      return res.status(200).json(dataNovo);
    } catch (err) {
      return res.status(500).json({ erro: 'Erro ao processar: ' + err.message });
    }
  }

  return res.status(405).json({ erro: 'Metodo nao permitido' });
}
