import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import { getSettings, db, now } from './db.js';
import { config } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Layout de e-mail (tabela, inline, compatível com Gmail/Outlook) */
export function emailLayout({ preheader = '', heading, paragraphs = [], cta, footnote }) {
  const s = getSettings();
  const btn = cta ? `<tr><td style="padding:8px 0 24px"><a href="${esc(cta.url)}" style="display:inline-block;background:#C9A45C;color:#0B1A2A;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px">${esc(cta.label)}</a></td></tr>` : '';
  return `<!doctype html><html><body style="margin:0;background:#EEF1EC;padding:0">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1EC;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#0B1A2A;padding:26px 32px;color:#E9D8B0;font-family:Georgia,serif;font-size:18px;letter-spacing:.5px">${esc(s.brand_name)}</td></tr>
<tr><td style="padding:32px 32px 8px;font-family:Arial,sans-serif;color:#1C2A36">
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;line-height:1.25;margin:0 0 18px;color:#0B1A2A">${esc(heading)}</h1>
<table role="presentation" width="100%">${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:1.65;padding:0 0 14px">${p}</td></tr>`).join('')}${btn}</table>
</td></tr>
<tr><td style="padding:0 32px 28px;font-family:Arial,sans-serif;font-size:12px;color:#6B7A86;line-height:1.6">${footnote ? esc(footnote) + '<br>' : ''}${s.support_email ? `Dúvidas? Responda este e-mail ou escreva para ${esc(s.support_email)}.` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

function htmlToText(html) {
  return html.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2: $1').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|tr|h1)>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
}

export async function sendEmail({ to, subject, html, text, userId, kind = 'generic', ref = '' }) {
  const s = getSettings();
  const from = { name: s.email_from_name || s.brand_name, address: s.email_from_address };
  text = text || htmlToText(html);
  let status = 'sent', error = null;
  try {
    if (!to) throw new Error('Destinatário vazio');
    const provider = s.email_provider || 'log';
    if (provider !== 'log' && !from.address) throw new Error('Configure o e-mail remetente em Configurações › E-mail');
    if (provider === 'resend') await sendResend(s, from, to, subject, html, text);
    else if (provider === 'brevo') await sendBrevo(s, from, to, subject, html, text);
    else if (provider === 'smtp') await sendSmtp(s, from, to, subject, html, text);
    else { status = 'logged'; console.log(`[email:log] para=${to} assunto="${subject}"\n${text}\n`); }
  } catch (e) {
    status = 'failed'; error = String(e.message || e).slice(0, 500);
    console.error('[email] falha:', error);
  }
  if (userId) {
    db.run(`INSERT INTO notifications (user_id, kind, ref, channel, status, error, created_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(user_id, kind, ref, channel) DO UPDATE SET status = excluded.status, error = excluded.error, created_at = excluded.created_at`,
      userId, kind, ref, 'email', status, error, now());
  }
  return { status, error };
}

async function sendResend(s, from, to, subject, html, text) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.resend_api_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${from.name} <${from.address}>`, to: [to], subject, html, text, reply_to: s.support_email || undefined }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function sendBrevo(s, from, to, subject, html, text) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': s.brevo_api_key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: from.name, email: from.address }, to: [{ email: to }], subject, htmlContent: html, textContent: text, replyTo: s.support_email ? { email: s.support_email } : undefined }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ---------- SMTP mínimo (465 TLS implícito ou 587 STARTTLS) ----------
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

function smtpSession(socket) {
  let buf = '';
  let waiter = null;
  const onData = (d) => {
    buf += d.toString('utf8');
    if (!waiter) return; // guarda até alguém pedir a resposta
    // resposta completa: última linha "NNN " (sem hífen)
    const lines = buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i])) {
        const resp = lines.slice(0, i + 1).join('\n');
        buf = lines.slice(i + 1).join('\r\n');
        const w = waiter; waiter = null; w?.(resp);
        return;
      }
    }
  };
  socket.on('data', onData);
  let failErr = null;
  socket.on('error', (e) => { failErr = e; const w = waiter; waiter = null; w?.(null); });
  socket.on('close', () => { if (!failErr) failErr = new Error('Conexão SMTP encerrada pelo servidor'); const w = waiter; waiter = null; w?.(null); });
  const read = () => new Promise((resolve, reject) => {
    if (failErr) return reject(failErr);
    waiter = (resp) => (resp === null ? reject(failErr) : resolve(resp));
    onData(Buffer.alloc(0));
  });
  const cmd = async (line, expect) => {
    if (line !== null) socket.write(line + '\r\n');
    const resp = await read();
    const code = Number(resp.slice(0, 3));
    if (expect && !expect.includes(code)) throw new Error(`SMTP "${line?.split(' ')[0]}" → ${resp}`);
    return resp;
  };
  return { cmd, detach: () => socket.off('data', onData) };
}

async function sendSmtp(s, from, to, subject, html, text) {
  const host = s.smtp_host; const port = Number(s.smtp_port || 465);
  const implicit = s.smtp_secure === 'true' || port === 465;
  let socket = await new Promise((resolve, reject) => {
    const sock = implicit ? tls.connect({ host, port, servername: host }, () => resolve(sock)) : net.connect({ host, port }, () => resolve(sock));
    sock.setTimeout(20000, () => { sock.destroy(new Error('SMTP timeout')); });
    sock.once('error', reject);
  });
  let sess = smtpSession(socket);
  const me = os.hostname() || 'localhost';
  await sess.cmd(null, [220]);
  let ehlo = await sess.cmd(`EHLO ${me}`, [250]);
  if (!implicit && /STARTTLS/i.test(ehlo)) {
    await sess.cmd('STARTTLS', [220]);
    sess.detach();
    socket = await new Promise((resolve, reject) => { const t = tls.connect({ socket, servername: host }, () => resolve(t)); t.once('error', reject); });
    sess = smtpSession(socket);
    ehlo = await sess.cmd(`EHLO ${me}`, [250]);
  }
  if (s.smtp_user) {
    await sess.cmd('AUTH LOGIN', [334]);
    await sess.cmd(b64(s.smtp_user), [334]);
    await sess.cmd(b64(s.smtp_pass), [235]);
  }
  await sess.cmd(`MAIL FROM:<${from.address}>`, [250]);
  await sess.cmd(`RCPT TO:<${to}>`, [250, 251]);
  await sess.cmd('DATA', [354]);
  const boundary = 'b' + Math.random().toString(36).slice(2);
  const msg = [
    `From: ${encHeader(from.name)} <${from.address}>`, `To: <${to}>`, `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${from.address.split('@')[1]}>`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/.{76}/g, '$&\r\n'),
    `--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(html).replace(/.{76}/g, '$&\r\n'),
    `--${boundary}--`, '.',
  ].join('\r\n');
  await sess.cmd(msg, [250]);
  await sess.cmd('QUIT', [221]).catch(() => {});
  socket.end();
}

// ---------- modelos ----------
export function accessEmail({ name, link, isNew }) {
  const s = getSettings();
  const first = (name || '').split(' ')[0] || 'olá';
  return {
    subject: isNew ? `Seu acesso chegou: ${s.brand_name}` : `Seu link de acesso: ${s.brand_name}`,
    html: emailLayout({
      preheader: 'Crie sua senha e comece hoje pelo Dia 1.',
      heading: isNew ? `${esc(first)}, o seu desafio começa hoje.` : `${esc(first)}, aqui está o seu acesso.`,
      paragraphs: [
        isNew ? 'Que alegria ter você aqui. A sua inscrição foi confirmada e o Dia 1 já está liberado.' : 'Use o botão abaixo para entrar e definir a sua senha.',
        'Clique no botão, crie a sua senha e salve o app na tela inicial do seu celular para acessar com um toque.',
      ],
      cta: { label: 'Acessar e criar minha senha', url: link },
      footnote: 'Este link é pessoal e vale por 72 horas. Depois disso, use "Esqueci minha senha" na tela de login.',
    }),
  };
}

export function resetEmail({ name, link }) {
  const first = (name || '').split(' ')[0] || 'olá';
  return {
    subject: 'Redefinição de senha',
    html: emailLayout({ heading: `${esc(first)}, vamos redefinir a sua senha`, paragraphs: ['Recebemos um pedido para redefinir a sua senha. Se não foi você, ignore este e-mail.'], cta: { label: 'Criar nova senha', url: link }, footnote: 'O link vale por 2 horas.' }),
  };
}

export function releaseEmail({ name, lesson }) {
  const first = (name || '').split(' ')[0] || '';
  const msg = (lesson.release_message || '').replace(/\[nome\]/gi, first).replace(/\[link\]/gi, '').trim();
  const paras = msg ? msg.split(/\n+/).filter((l) => !/^acesse aqui:?\s*$/i.test(l.trim())).map(esc) : [esc(lesson.subtitle || '')];
  return {
    subject: `Dia ${lesson.number} liberado: ${lesson.title}`,
    html: emailLayout({ preheader: lesson.subtitle || '', heading: `Dia ${lesson.number}: ${esc(lesson.title)}`, paragraphs: paras, cta: { label: `Abrir o Dia ${lesson.number}`, url: `${config.appUrl}/dia/${lesson.number}` } }),
  };
}
