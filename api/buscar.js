export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.PACTO_API_KEY;
  const EMPRESA_ID = process.env.PACTO_EMPRESA_ID || '1';
  const BASE_URL = 'https://apigw.pactosolucoes.com.br';
  const headers = {
    'Authorization': 'Bearer ' + API_KEY,
    'empresaId': EMPRESA_ID
  };

  // GET = buscar por CPF
  if (req.method === 'GET') {
    const { cpf } = req.query;
    if (!cpf) return res.status(400).json({ erro: 'CPF obrigatorio' });

    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) return res.status(400).json({ erro: 'CPF invalido' });

    try {
      const filters = encodeURIComponent(JSON.stringify({ documento: cpfLimpo, empresa: parseInt(EMPRESA_ID) }));
      const url = `${BASE_URL}/cadastro-cliente/consultar?filters=${filters}&page=0&size=1`;

      const resp = await fetch(url, { headers });
      const data = await resp.json();

      if (!data.content || data.content.length === 0) {
        return res.status(404).json({ erro: 'Cliente nao encontrado', existe: false });
      }

      const c = data.content[0];
      return res.status(200).json({
        existe: true,
        pessoa: c.pessoa,
        cliente: c.cliente,
        nome: c.nome,
        matricula: c.matricula,
        urlFoto: c.urlFoto || null,
        situacao: c.situacao,
        cpf: c.cpf,
        telefone: c.telefone || '',
        email: c.email || '',
        dataNascimento: c.dataNascimento || ''
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

    try {
      // 1. Buscar se CPF ja existe
      const filters = encodeURIComponent(JSON.stringify({ documento: cpfLimpo, empresa: parseInt(EMPRESA_ID) }));
      const urlBusca = `${BASE_URL}/cadastro-cliente/consultar?filters=${filters}&page=0&size=1`;
      const respBusca = await fetch(urlBusca, { headers });
      const dataBusca = await respBusca.json();

      if (dataBusca.content && dataBusca.content.length > 0) {
        // EXISTE — atualizar dados
        const existente = dataBusca.content[0];
        const pessoaCod = existente.pessoa;

        // Atualizar pessoa (nome, telefone, email, data nascimento)
        const bodyAtualizar = {};
        if (nome) bodyAtualizar.nome = nome.toUpperCase();
        if (telLimpo) bodyAtualizar.telefoneCelular = telLimpo;
        if (email) bodyAtualizar.email = email;
        if (dataNascimento) bodyAtualizar.dataNascimento = dataNascimento;
        if (sexo) bodyAtualizar.sexo = sexo;

        // PUT para atualizar pessoa
        const urlAtualizar = `${BASE_URL}/pessoa/${pessoaCod}`;
        await fetch(urlAtualizar, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyAtualizar)
        });

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
      } else {
        // NAO EXISTE — cadastrar novo via /cliente/simplificado
        let tsNascimento = null;
        if (dataNascimento) {
          const parts = dataNascimento.split('/');
          if (parts.length === 3) {
            const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            tsNascimento = d.getTime();
          }
        }

        const bodyNovo = {
          nome: nome.toUpperCase(),
          celular: telLimpo || '',
          email: email || '',
          sexo: sexo || 'M'
        };
        if (tsNascimento) bodyNovo.dataNascimento = tsNascimento;

        const respNovo = await fetch(`${BASE_URL}/cliente/simplificado`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyNovo)
        });

        let dataNovo;
        const textNovo = await respNovo.text();
        try { dataNovo = JSON.parse(textNovo); } catch (e) {
          return res.status(500).json({ erro: 'Erro API: ' + textNovo.substring(0, 200) });
        }

        if (dataNovo.erro) return res.status(500).json({ erro: dataNovo.erro });

        if (dataNovo.return) {
          // Agora atualizar o CPF via endpoint de pessoa
          const pessoaCod = dataNovo.return.codigoPessoa;
          try {
            await fetch(`${BASE_URL}/pessoa/${pessoaCod}`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ cpf: cpfLimpo })
            });
          } catch (e) { /* best effort */ }

          return res.status(200).json({
            existe: false,
            criado: true,
            pessoa: dataNovo.return.codigoPessoa,
            cliente: dataNovo.return.codigoCliente,
            nome: dataNovo.return.nome,
            matricula: dataNovo.return.matriculaZW,
            urlFoto: null,
            situacao: dataNovo.return.situacaoAluno
          });
        }

        return res.status(200).json(dataNovo);
      }
    } catch (err) {
      return res.status(500).json({ erro: 'Erro ao processar: ' + err.message });
    }
  }

  return res.status(405).json({ erro: 'Metodo nao permitido' });
}
