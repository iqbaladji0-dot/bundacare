export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ text: 'Method Not Allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ text: 'Error: API key tidak ditemukan.' });

  const { mode, query, age, playType, history } = req.body;

  const baseInstruction = `Kamu adalah BundaCare, asisten parenting terpercaya untuk ibu-ibu Indonesia.
Jawab dalam Bahasa Indonesia yang hangat dan praktis.
Gunakan emoji secukupnya (tidak berlebihan).`;

  let systemPrompt = "";

  if (mode === 'Dokter') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai konsultan kesehatan bayi yang hangat dan teliti.

ATURAN PENTING:
- Jika ini pertanyaan PERTAMA atau informasi masih kurang lengkap, tanya 1-2 pertanyaan spesifik dulu untuk menggali info lebih dalam (suhu, durasi, gejala lain, riwayat, dll). Jangan langsung kasih solusi.
- Jika sudah ada cukup info dari percakapan sebelumnya, berikan analisis dan saran yang konkret.
- Format jawaban akhir: kemungkinan penyebab, yang bisa dilakukan di rumah, kapan harus ke dokter.
- Maksimal 5 poin. Singkat dan tepat.
Konteks: bayi usia ${age}.`;

  } else if (mode === 'MPASI') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai ahli MPASI yang praktis dan kreatif.

ATURAN PENTING:
- Jika informasi masih kurang (tekstur yang disukai, alergi, bahan yang ada), tanya dulu 1-2 pertanyaan.
- Jika sudah cukup info, berikan resep lengkap: nama resep, bahan & takaran, cara membuat (3-4 langkah), tips nutrisi.
- Sesuaikan tekstur dan porsi dengan usia bayi.
Bayi usia ${age}.`;

  } else if (mode === 'Imunisasi') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai konsultan imunisasi berdasarkan jadwal IDAI terbaru.

ATURAN PENTING:
- Jika info kurang (vaksin apa yang sudah didapat, riwayat reaksi), tanya dulu.
- Jika sudah cukup, berikan jadwal dan info vaksin yang jelas dan lengkap.
Bayi usia ${age}.`;

  } else if (mode === 'Tumbuh') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai konsultan tumbuh kembang yang positif dan suportif.

ATURAN PENTING:
- Jika info kurang (milestone yang sudah dicapai, stimulasi yang sudah dilakukan), tanya dulu 1-2 hal.
- Jika sudah cukup, berikan penilaian perkembangan, stimulasi praktis (2-3 ide), dan catatan penting.
Bayi usia ${age}.`;

  } else if (mode === 'Bermain') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai ahli stimulasi anak yang kreatif dan menyenangkan.

ATURAN PENTING:
- Jika info kurang (bahan yang tersedia, tempat bermain, kondisi anak), tanya dulu 1 pertanyaan.
- Jika sudah cukup, berikan 3 ide bermain ${playType} yang konkret: nama → cara main → manfaat.
Bayi usia ${age}.`;

  } else if (mode === 'Tenang') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai sahabat terbaik yang penuh empati dan pengertian.

ATURAN PENTING:
- Selalu validasi perasaan Bunda terlebih dahulu dengan hangat.
- Tanya lebih dalam untuk memahami situasinya sebelum kasih saran.
- Jangan terburu-buru kasih solusi — dengarkan dulu.
- Setelah cukup info, beri 1-2 saran praktis yang realistis dan menyemangati.`;

  } else if (mode === 'MPASI_Jadwal') {
    systemPrompt = `${baseInstruction}
Buatkan jadwal MPASI lengkap untuk bayi usia ${age}.
Tanya dulu apakah ada alergi atau pantangan makanan, baru buat jadwal.
Format jadwal: frekuensi makan, tekstur, contoh menu per waktu makan, porsi, tips.`;

  } else if (mode === 'Imunisasi_Jadwal') {
    systemPrompt = `${baseInstruction}
Buatkan jadwal imunisasi lengkap berdasarkan panduan IDAI untuk bayi lahir ${query}.
Format tabel: Usia | Vaksin | Keterangan. Tambah catatan penting di akhir.`;
  }

  // Build conversation history for multi-turn
  let contents = [];

  if (history && history.length > 0) {
    const firstUserMsg = history[0];
    contents.push({
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\n${firstUserMsg.text}` }]
    });
    for (let i = 1; i < history.length; i++) {
      contents.push({
        role: history[i].role,
        parts: [{ text: history[i].text }]
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: query }]
    });
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\n${query}` }]
    });
  }

  // Fungsi retry untuk Gemini
  async function callGemini(body, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );

      if (response.ok) return response;

      const status = response.status;
      if ((status === 503 || status === 429) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }

      return response;
    }
  }

  // Herbal prompt khusus Dokter (hanya pertanyaan pertama)
  let herbalText = null;
  if (mode === 'Dokter' && (!history || history.length === 0)) {
    try {
      const herbalPrompt = `Kamu adalah ahli pengobatan herbal tradisional Indonesia yang juga paham medis modern.
Berikan 2-3 tips herbal/tradisional yang AMAN untuk mengatasi: ${query} pada bayi usia ${age}.
Format:
- Nama herbal/cara tradisional
- Cara penggunaan singkat
Wajib tambahkan sumber terpercaya (Kemenkes RI, IDAI, atau WHO).
Akhiri dengan disclaimer 1 kalimat bahwa ini hanya pendamping, bukan pengganti dokter.
Jawab singkat, maksimal 4 poin.`;

      const herbalRes = await callGemini({
        contents: [{ role: 'user', parts: [{ text: herbalPrompt }] }]
      });
      if (herbalRes && herbalRes.ok) {
        const herbalData = await herbalRes.json();
        herbalText = herbalData.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }
    } catch(e) {
      herbalText = null;
    }
  }

  try {
    const response = await callGemini({ contents });

    const rawText = await response.text();
    if (!response.ok) {
      return res.status(200).json({ text: `Maaf Bunda, BundaCare sedang sibuk. Coba lagi sebentar ya 🙏` });
    }

    const data = JSON.parse(rawText);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, tidak ada respons.";

    return res.status(200).json({
      text,
      herbal: herbalText
    });
  } catch (err) {
    return res.status(200).json({ text: "Maaf Bunda, terjadi gangguan koneksi. Coba lagi ya 🙏" });
  }
}
