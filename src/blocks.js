// Blocos de conteúdo da aula: o produtor monta a aula com texto, materiais, exercícios, tarefas, destaques, vídeos e botões.
import { db, now } from './db.js';
import { fail } from './http.js';
import { jparse } from './services.js';

export const BLOCK_TYPES = ['text', 'materials', 'exercise', 'checklist', 'callout', 'video', 'button', 'quotes', 'points'];
const CALLOUTS = ['tip', 'info', 'warning', 'important'];
const str = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const isUrl = (u) => /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^\/media\/[\w./-]+$/.test(u);
const list = (v, max, fn) => (Array.isArray(v) ? v : []).slice(0, max).map(fn).filter(Boolean);

/** Valida e limpa os blocos enviados pelo painel */
export function sanitizeBlocks(input) {
  if (!Array.isArray(input)) fail(400, 'Blocos inválidos.');
  if (input.length > 40) fail(400, 'Máximo de 40 blocos por aula.');
  const seen = new Set();
  return input.map((b, i) => {
    const type = b?.type;
    if (!BLOCK_TYPES.includes(type)) fail(400, `Bloco ${i + 1}: tipo inválido.`);
    let id = /^[a-z0-9]{4,24}$/.test(b.id || '') ? b.id : Math.random().toString(36).slice(2, 12);
    while (seen.has(id)) id = Math.random().toString(36).slice(2, 12);
    seen.add(id);
    const o = { id, type, title: str(b.title, 160) };
    if (type === 'text') o.body = str(b.body, 12000);
    if (type === 'callout') { o.variant = CALLOUTS.includes(b.variant) ? b.variant : 'tip'; o.body = str(b.body, 3000); }
    if (type === 'quotes') o.items = list(b.items, 30, (x) => (str(x?.text, 1200) ? { text: str(x.text, 1200), ref: str(x.ref, 160) } : null));
    if (type === 'points') o.items = list(b.items, 30, (x) => str(x, 600) || null);
    if (type === 'materials') {
      o.items = list(b.items, 30, (x) => {
        const url = str(x?.url, 1000);
        if (!url && !str(x?.title, 200)) return null;
        if (!isUrl(url)) fail(400, `Bloco ${i + 1}: o link "${url || '(vazio)'}" precisa começar com https://`);
        return { title: str(x.title, 200) || 'Material', url, desc: str(x.desc, 300) };
      });
    }
    if (type === 'exercise') { o.questions = list(b.questions, 20, (x) => str(x, 600) || null); o.required = !!b.required; if (!o.questions.length) fail(400, `Bloco ${i + 1}: o exercício precisa de pelo menos uma pergunta.`); }
    if (type === 'checklist') { o.items = list(b.items, 30, (x) => str(x, 300) || null); o.required = !!b.required; if (!o.items.length) fail(400, `Bloco ${i + 1}: a lista de tarefas precisa de pelo menos um item.`); }
    if (type === 'video') { o.url = str(b.url, 1000); o.duration = str(b.duration, 20); if (o.url && !isUrl(o.url)) fail(400, `Bloco ${i + 1}: link do vídeo inválido.`); }
    if (type === 'button') { o.label = str(b.label, 60) || 'Acessar'; o.url = str(b.url, 1000); o.body = str(b.body, 600); if (!isUrl(o.url)) fail(400, `Bloco ${i + 1}: o botão precisa de um link que comece com https://`); }
    return o;
  });
}

export const lessonBlocks = (lesson) => jparse(lesson.blocks, []);

export function loadBlockAnswers(userId, lessonId) {
  return Object.fromEntries(db.all('SELECT block_id, data FROM block_answers WHERE user_id = ? AND lesson_id = ?', userId, lessonId).map((r) => [r.block_id, jparse(r.data, {})]));
}

/** Salva a resposta do aluno a um exercício ou o estado de uma lista de tarefas */
export function saveBlockAnswer(userId, lesson, blockId, data) {
  const b = lessonBlocks(lesson).find((x) => x.id === blockId);
  if (!b || !['exercise', 'checklist'].includes(b.type)) fail(404, 'Bloco não encontrado.');
  let clean;
  if (b.type === 'exercise') clean = { answers: b.questions.map((_, i) => str(data?.answers?.[i], 8000)) };
  else clean = { done: [...new Set((Array.isArray(data?.done) ? data.done : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < b.items.length))].sort((x, y) => x - y) };
  db.run(`INSERT INTO block_answers (user_id, lesson_id, block_id, data, updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, lesson_id, block_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`, userId, lesson.id, blockId, JSON.stringify(clean), now());
  return clean;
}

/** Bloqueia a conclusão quando há exercício ou tarefa obrigatória pendente */
export function missingRequired(userId, lesson) {
  const ans = loadBlockAnswers(userId, lesson.id);
  for (const b of lessonBlocks(lesson)) {
    if (!b.required) continue;
    if (b.type === 'exercise' && b.questions.some((_, i) => !String(ans[b.id]?.answers?.[i] || '').trim())) return `Responda o exercício "${b.title || 'Exercício'}" antes de concluir.`;
    if (b.type === 'checklist' && (ans[b.id]?.done || []).length < b.items.length) return `Conclua as tarefas de "${b.title || 'Tarefas'}" antes de concluir.`;
  }
  return null;
}

/** Respostas dos exercícios e tarefas de um aluno num produto (para o painel) */
export function studentBlockAnswers(userId, productId) {
  const lessons = db.all('SELECT id, number, title, blocks FROM lessons WHERE product_id = ? ORDER BY number', productId);
  const rows = db.all('SELECT a.* FROM block_answers a JOIN lessons l ON l.id = a.lesson_id WHERE a.user_id = ? AND l.product_id = ?', userId, productId);
  const out = [];
  for (const l of lessons) {
    for (const b of lessonBlocks(l)) {
      const r = rows.find((x) => x.lesson_id === l.id && x.block_id === b.id);
      if (!r) continue;
      const d = jparse(r.data, {});
      if (b.type === 'exercise') out.push({ lesson: l.number, lessonTitle: l.title, type: 'exercise', title: b.title || 'Exercício', items: b.questions.map((q, i) => ({ q, a: d.answers?.[i] || '' })), updatedAt: r.updated_at });
      if (b.type === 'checklist') out.push({ lesson: l.number, lessonTitle: l.title, type: 'checklist', title: b.title || 'Tarefas', items: b.items.map((t, i) => ({ q: t, done: (d.done || []).includes(i) })), updatedAt: r.updated_at });
    }
  }
  return out;
}

// ---------- arquivos de materiais (PDF, planilhas, apresentações, áudios) ----------
export const FILE_TYPES = {
  pdf: { mime: 'application/pdf', sig: (b) => b.subarray(0, 4).toString() === '%PDF' },
  docx: { sig: (b) => b[0] === 0x50 && b[1] === 0x4b }, xlsx: { sig: (b) => b[0] === 0x50 && b[1] === 0x4b }, pptx: { sig: (b) => b[0] === 0x50 && b[1] === 0x4b },
  zip: { sig: (b) => b[0] === 0x50 && b[1] === 0x4b },
  png: { sig: (b) => b[0] === 0x89 && b[1] === 0x50 }, jpg: { sig: (b) => b[0] === 0xff && b[1] === 0xd8 }, jpeg: { sig: (b) => b[0] === 0xff && b[1] === 0xd8 },
  mp3: { sig: (b) => (b.subarray(0, 3).toString() === 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  m4a: { sig: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  csv: { sig: (b) => !b.subarray(0, 512).includes(0) }, txt: { sig: (b) => !b.subarray(0, 512).includes(0) },
};
