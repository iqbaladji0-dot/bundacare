export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ allowed: false });

  const { email } = req.body;
  if (!email) return res.status(200).json({ allowed: false, message: 'Email tidak boleh kosong.' });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!sheetId || !apiKey) {
    return res.status(200).json({ allowed: false, message: 'Konfigurasi server belum lengkap.' });
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:C?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    const rows = data.values || [];
    const emailLower = email.toLowerCase().trim();

    const found = rows.find((row, index) => {
      if (index === 0) return false; // skip header
      const rowEmail = (row[0] || '').toLowerCase().trim();
      const status = (row[1] || '').toLowerCase().trim();
      return rowEmail === emailLower && status === 'aktif';
    });

    if (found) {
      return res.status(200).json({ allowed: true });
    } else {
      return res.status(200).json({ allowed: false, message: 'Email tidak ditemukan atau belum aktif. Silakan hubungi admin.' });
    }
  } catch (err) {
    return res.status(200).json({ allowed: false, message: 'Gagal memeriksa akses: ' + err.message });
  }
}
