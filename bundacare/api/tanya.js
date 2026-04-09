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
Jawab dalam Bahasa Indonesia yang hangat, singkat, dan praktis.
Gunakan emoji secukupnya (tidak berlebihan).
Maksimal 5 poin utama. Langsung ke inti, tidak bertele-tele.`;

  let systemPrompt = "";

  if (mode === 'Dokter') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai konsultan kesehatan bayi yang hangat.
Untuk pertanyaan awal, format jawaban:
- Kemungkinan penyebab (1-2 poin)
- Yang bisa dilakukan di rumah (2-3 langkah praktis)
- Kapan harus ke dokter (1 kalimat tegas)
Untuk pertanyaan follow-up, jawab sesuai konteks dengan singkat dan tepat.
Konteks: bayi usia ${age}.`;

  } else if (mode === 'MPASI') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai ahli MPASI yang praktis.
Format jawaban: nama resep, bahan & takaran, cara membuat (3-4 langkah), tips nutrisi.
Bayi usia ${age}.`;

  } else if (mode === 'Imunisasi') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai konsultan imunisasi berdasarkan jadwal IDAI terbaru.
Bayi usia ${age}.`;

  } else if (mode === 'Tumbuh') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai konsultan tumbuh kembang yang positif.
Format: penilaian perkembangan, stimulasi praktis (2-3 ide), catatan penting.
Bayi usia ${age}.`;

  } else if (mode === 'Bermain') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai ahli stimulasi anak yang kreatif.
Berikan 3 ide bermain ${playType}. Format: nama → cara main → manfaat.
Bayi usia ${age}.`;

  } else if (mode === 'Tenang') {
    systemPrompt = `${baseInstruction}
Kamu berperan sebagai sahabat terbaik yang penuh empati.
Jawab hangat seperti teman dekat — validasi perasaan, beri semangat, 1-2 saran praktis.`;

  } else if (mode === 'MPASI_Jadwal') {
    systemPrompt = `${baseInstruction}
Buatkan jadwal MPASI lengkap untuk bayi usia ${age}.
Format: frekuensi makan, tekstur, contoh menu per waktu makan, porsi, tips.`;

  } else if (mode === 'Imunisasi_Jadwal') {
    systemPrompt = `${baseInstruction}
Buatkan jadwal imunisasi lengkap berdasarkan panduan IDAI untuk bayi lahir ${query}.
Format tabel: Usia | Vaksin | Keterangan. Tambah catatan penting di akhir.`;
  }

  // Build conversation history for multi-turn
  let contents = [];

  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role,
        parts: [{ text: msg.text }]
      });
    }
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\n${query}` }]
    });
  }

  // Herbal prompt khusus Dokter
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

      const herbalRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: herbalPrompt }] }]
          })
        }
      );
      const herbalData = await herbalRes.json();
      herbalText = herbalData.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch(e) {
      herbalText = null;
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );

    const rawText = await response.text();
    if (!response.ok) {
      return res.status(200).json({ text: `Error Gemini ${response.status}: ${rawText.substring(0, 200)}` });
    }

    const data = JSON.parse(rawText);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, tidak ada respons.";
    
    return res.status(200).json({ 
      text,
      herbal: herbalText
    });
  } catch (err) {
    return res.status(200).json({ text: "Error: " + err.message });
  }
}
