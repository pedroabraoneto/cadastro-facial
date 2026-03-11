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
    const urlFoto = `${BASE_URL}/cliente/atualizarFotoCliente?codigopessoa=${pessoa}&foto=${encodeURIComponent(fotoBase64)}`;

    const respFoto = await fetch(urlFoto, {
      method: 'POST',
      headers: {
        'api_key': API_KEY,
        'empresaId': EMPRESA_ID,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const dataFoto = await respFoto.json();

    if (dataFoto.erro) {
      return res.status(500).json({ erro: 'Erro ao salvar foto: ' + dataFoto.erro });
    }

    // 2. Atualizar template facial
    const urlTemplate = `${BASE_URL}/cliente/atualizaTemplateFacial`;
    const respTemplate = await fetch(urlTemplate, {
      method: 'POST',
      headers: {
        'api_key': API_KEY,
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
