export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ error: 'API key tidak ditemukan.' });

  const { type, age, gejalaAwal, updateText, riwayatUpdate } = req.body;

  let prompt = '';

  if (type === 'mulai') {
    prompt = `Kamu adalah BundaCare, asisten parenting terpercaya Indonesia.
Bayi/anak usia ${age} mengalami: ${gejalaAwal}

PENTING: Jawab HANYA dengan JSON valid. Tidak ada teks sebelum atau sesudah JSON. Tidak ada markdown. Gunakan tanda kutip biasa (") bukan curly quotes.

{"analisis":"isi","nonObat":[{"tips":"isi","sumber":"Kemenkes RI"}],"herbal":[{"cara":"isi","sumber":"Kemenkes RI"}],"obatUmum":"isi","tandaBahaya":["isi"],"statusAwal":"ringan","pesanPemantauan":"isi"}`;

  } else if (type === 'update') {
    const historyText = (riwayatUpdate || []).map((u, i) => `Update ${i+1} (${u.waktu}): ${u.kondisi}`).join('\n');
    prompt = `Kamu adalah BundaCare memantau anak usia ${age}.
Gejala awal: ${gejalaAwal}
Riwayat: ${historyText}
Update terbaru: ${updateText}

PENTING: Jawab HANYA dengan JSON valid. Tidak ada teks lain. Gunakan tanda kutip biasa (").

{"status":"membaik","analisis":"isi","nonObat":[{"tips":"isi","sumber":"Kemenkes RI"}],"herbal":[{"cara":"isi","sumber":"isi"}],"obatUmum":null,"tandaBahaya":["isi"],"harusKeRS":false,"pesanRS":null,"sembuh":false,"pesanSembuh":null,"pesanLanjut":"isi"}`;
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
        })
      }
    );

    if (!geminiRes.ok) {
      return res.status(200).json({ error: `Error Gemini: ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    text = text.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
    text = text.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
    const match = text.match(/\{[\s\S]*\}/);
    if (match) text = match[0];

    try {
      const parsed = JSON.parse(text);
      return res.status(200).json(parsed);
    } catch(e) {
      return res.status(200).json({ error: 'Parse gagal: ' + text.substring(0, 150) });
    }

  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}