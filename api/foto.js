export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' });

  const { pessoa, foto } = req.body;
  if (!pessoa || !foto) return res.status(400).json({ erro: 'pessoa e foto sao obrigatorios' });

  const API_KEY = process.env.PACTO_API_KEY;
  const EMPRESA_ID = process.env.PACTO_EMPRESA_ID || '1';
  const BASE_URL = 'https://apigw.pactosolucoes.com.br';

  try {
    // 1. Atualizar foto do cliente
    const fotoBase64 = foto.replace(/^data:image\/\w+;base64,/, '');
    const urlFoto = `${BASE_URL}/cliente/atualizarFotoCliente`;

    const bodyParams = new URLSearchParams();
    bodyParams.append('codigopessoa', pessoa);
    bodyParams.append('foto', fotoBase64);

    const respFoto = await fetch(urlFoto, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'empresaId': EMPRESA_ID,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: bodyParams.toString()
    });

    let dataFoto;
    const respFotoText = await respFoto.text();
    try {
      dataFoto = JSON.parse(respFotoText);
    } catch (e) {
      // Se não for JSON, tenta tratar como sucesso se status OK
      if (respFoto.ok) {
        dataFoto = { return: respFotoText || 'ok' };
      } else {
        return res.status(500).json({ erro: 'Erro da API ao salvar foto: ' + respFotoText.substring(0, 200) });
      }
    }

    if (dataFoto.erro) {
      return res.status(500).json({ erro: 'Erro ao salvar foto: ' + dataFoto.erro });
    }

    // 2. Atualizar template facial
    const urlTemplate = `${BASE_URL}/cliente/atualizaTemplateFacial`;
    const respTemplate = await fetch(urlTemplate, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'empresaId': EMPRESA_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ codigoPessoa: pessoa })
    });

    let dataTemplate = {};
    try { dataTemplate = await respTemplate.json(); } catch (e) {}

    return res.status(200).json({
      sucesso: true,
      urlFoto: dataFoto.return || null,
      templateFacial: dataTemplate
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao enviar foto: ' + err.message });
  }
}
