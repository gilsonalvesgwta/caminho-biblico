// Tela do WhatsApp (Evolution API): conexão, número que envia, mensagens, teste e histórico.
import { api, esc, toast, withLoading, fmtDateTime, relTime, $, $$ } from '/shared/ui.js';

const STATE = { open: ['Conectado', 'ok'], connecting: ['Aguardando leitura do QR code', 'warn'], close: ['Desconectado', 'err'], closed: ['Desconectado', 'err'], unknown: ['Sem informação', ''] };
const KIND = { access: 'Dados de acesso', product: 'Novo produto', test: 'Teste' };
const MSG = { sent: ['Enviada', 'ok'], queued: ['Na fila', 'gold'], failed: ['Falhou', 'err'], skipped: ['Sem telefone', 'warn'] };
const VARS = [['[nome]', 'primeiro nome'], ['[nome_completo]', 'nome completo'], ['[email]', 'e-mail de login'], ['[link]', 'link de acesso'], ['[produto]', 'curso/desafio comprado'], ['[plataforma]', 'nome da plataforma']];
const sample = { '[nome]': 'Maria', '[nome_completo]': 'Maria Souza', '[email]': 'maria@email.com', '[link]': 'https://altis.wtatech.com.br/acesso?t=…', '[produto]': 'Riqueza a Dois', '[plataforma]': 'Altis' };
/** Prévia no estilo do WhatsApp: *negrito*, _itálico_, quebras de linha */
const preview = (t) => esc(Object.entries(sample).reduce((s, [k, v]) => s.split(k).join(v), t || '')).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/\n/g, '<br>');

export async function pageWhatsApp({ head, can }) {
  const st = await api('/api/admin/whatsapp');
  const owner = can('owner');
  const [sl, sc] = st.state ? STATE[st.state] || [st.state, ''] : st.error ? ['Erro de conexão', 'err'] : ['Não configurado', ''];
  const c = st.counts || {};
  $('#main').innerHTML = head('WhatsApp', 'Os dados de acesso chegam no WhatsApp do aluno junto com o e-mail, assim que a compra é confirmada.') + `
    <div class="cols">
      <div class="panel c12 wa-top"><div class="panel-b">
        <div class="wa-switch">${owner ? `<label class="toggle wa-big"><input type="checkbox" id="wa-on" ${st.enabled ? 'checked' : ''}><i></i><span>${st.enabled ? 'Envio automático ligado' : 'Envio automático desligado'}</span></label>` : `<b>${st.enabled ? 'Envio automático ligado' : 'Envio automático desligado'}</b>`}
          <p class="faint">${st.enabled ? 'Toda compra confirmada envia o e-mail e esta mensagem ao mesmo tempo.' : 'Conecte a Evolution e escolha o número para ligar.'}</p></div>
        <div class="wa-stat"><span>Número</span><b>${esc(st.instance || '—')}</b><span class="badge ${sc}">${esc(sl)}</span>${st.error ? `<small class="neg">${esc(st.error)}</small>` : ''}</div>
        <div class="wa-stat"><span>Últimos 30 dias</span><b>${c.sent || 0} enviada(s)</b><small>${c.failed || 0} falha(s) · ${c.skipped || 0} sem telefone${c.queued ? ` · ${c.queued} na fila` : ''}</small></div>
      </div></div>

      <div class="panel c6"><div class="panel-h"><h3>1. Conexão com a Evolution API</h3>${st.hasKey ? '<span class="badge ok">Salva</span>' : ''}</div><div class="panel-b">
        <form id="wa-conn" class="form-grid">
          <div class="field full"><label>Endereço da Evolution API</label><input class="input" name="url" value="${esc(st.url)}" placeholder="https://evolution.wtatech.com.br" ${owner ? '' : 'disabled'}></div>
          <div class="field full"><label>Chave global (apikey)</label><input class="input" name="key" type="password" autocomplete="off" placeholder="${st.keyHint ? `Salva: ${esc(st.keyHint)} (deixe em branco para manter)` : 'Cole a chave'}" ${owner ? '' : 'disabled'}></div>
          <div class="field"><label>DDI padrão</label><input class="input" name="country" value="${esc(st.country)}" maxlength="3" ${owner ? '' : 'disabled'}><span class="hint">Usado quando o telefone vem sem código do país.</span></div>
          ${owner ? '<div class="field" style="align-self:end"><button class="btn btn-primary">Salvar e testar conexão</button></div>' : ''}
        </form>
        <p class="hint" style="margin-top:12px">São os mesmos dados do CRM: no Portainer, abra a stack do CRM e copie <b>EVOLUTION_URL</b> e <b>EVOLUTION_CHAVE</b> (na stack da própria Evolution, a chave se chama <b>AUTHENTICATION_API_KEY</b>). A chave fica guardada com criptografia.</p>
      </div></div>

      <div class="panel c6"><div class="panel-h"><h3>2. Número que envia</h3>${owner && st.hasKey ? '<button class="btn btn-soft btn-sm" id="wa-load">Ver números</button>' : ''}</div><div class="panel-b" id="wa-inst">
        ${st.instance ? `<p style="margin-top:0">Enviando por <b>${esc(st.instance)}</b>.</p>` : ''}
        <p class="hint" style="margin-top:0">${st.hasKey ? 'Escolha um número já conectado na Evolution (pode ser o mesmo do CRM) ou crie um número exclusivo para a plataforma.' : 'Salve a conexão primeiro.'}</p>
      </div></div>

      <div class="panel c12"><div class="panel-h"><h3>3. Mensagens</h3><span class="faint">*negrito* · _itálico_ · emojis à vontade</span></div><div class="panel-b">
        <div class="wa-vars">${VARS.map(([k, l]) => `<button type="button" class="wa-var" data-var="${k}" title="Inserir ${l}">${k}<small>${l}</small></button>`).join('')}</div>
        <div class="wa-tpls">
          ${[['tpl_access', 'Compra confirmada (aluno novo)', st.tplAccess, 'Vai com o link para criar a senha. Vale 72 horas.'], ['tpl_product', 'Novo produto (quem já é aluno)', st.tplProduct, 'Vai com o link direto do produto.']].map(([k, l, v, h]) => `
          <div class="wa-tpl"><label>${l}</label><p class="hint" style="margin:0 0 8px">${h}</p>
            <div class="wa-edit"><textarea class="input" data-tpl="${k}" rows="12" ${owner ? '' : 'disabled'}>${esc(v)}</textarea>
            <div class="wa-phone"><div class="wa-bubble" data-prev="${k}">${preview(v)}<span class="wa-time">09:41 ✓✓</span></div></div></div></div>`).join('')}
        </div>
        ${owner ? '<div class="wa-actions"><button class="btn btn-primary" id="wa-save-tpl">Salvar mensagens</button></div>' : ''}
        <div class="wa-test"><b>Enviar um teste</b><input class="input" id="wa-test-phone" placeholder="Seu WhatsApp, ex.: (51) 99999-9999"><select class="input" id="wa-test-kind"><option value="access">Compra confirmada</option><option value="product">Novo produto</option></select><button class="btn btn-soft" id="wa-test">Enviar teste</button></div>
      </div></div>

      <div class="panel c12"><div class="panel-h"><h3>Últimas mensagens</h3><button class="btn btn-ghost btn-sm" id="wa-refresh">Atualizar</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Aluno</th><th>Telefone</th><th>Tipo</th><th>Situação</th><th>Quando</th><th></th></tr></thead><tbody>
        ${st.messages.map((m) => `<tr><td>${m.name ? `<b>${esc(m.name)}</b><br><small class="faint">${esc(m.email || '')}</small>` : '<span class="faint">—</span>'}</td><td>${m.phone ? `+${esc(m.phone)}` : '<span class="faint">sem telefone</span>'}</td><td>${KIND[m.kind] || esc(m.kind)}</td>
          <td><span class="badge ${MSG[m.status]?.[1] || ''}">${MSG[m.status]?.[0] || esc(m.status)}</span>${m.error ? `<br><small class="${m.status === 'failed' || m.status === 'skipped' ? 'neg' : 'faint'}">${esc(m.error)}${m.status === 'queued' ? ` · tentativa ${m.attempts + 1}` : ''}</small>` : ''}</td>
          <td>${fmtDateTime(m.sent_at || m.created_at)}<br><small class="faint">${relTime(m.sent_at || m.created_at)}</small></td>
          <td class="r">${m.kind !== 'test' && m.status !== 'queued' ? `<button class="btn btn-ghost btn-sm" data-resend="${m.id}">Reenviar</button>` : ''}${m.user_id ? ` <a class="btn btn-ghost btn-sm" href="/admin/alunos/${m.user_id}" data-go="/alunos/${m.user_id}">Ficha</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma mensagem ainda.</td></tr>'}
      </tbody></table></div></div>
    </div>`;

  const reload = () => pageWhatsApp({ head, can });
  $('#wa-on')?.addEventListener('change', async (e) => {
    try { await api('/api/admin/whatsapp', { method: 'PUT', body: { enabled: e.target.checked } }); toast(e.target.checked ? 'Envio automático ligado' : 'Envio automático desligado'); reload(); }
    catch (er) { e.target.checked = !e.target.checked; toast(er.message, { error: true, ms: 6000 }); }
  });
  $('#wa-conn')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target)); if (!body.key) delete body.key;
    await withLoading(e.submitter, async () => { try { await api('/api/admin/whatsapp', { method: 'PUT', body }); toast('Conexão com a Evolution funcionando'); reload(); } catch (er) { toast(er.message, { error: true, ms: 7000 }); } });
  });
  const loadInst = async () => {
    const box = $('#wa-inst'); box.innerHTML = '<p class="faint" style="margin:0">Buscando números…</p>';
    try {
      const { rows } = await api('/api/admin/whatsapp/instances');
      box.innerHTML = `<div class="wa-list">${rows.map((i) => { const [l, cl] = STATE[i.state] || [i.state, '']; return `<label class="wa-inst ${i.name === st.instance ? 'on' : ''}"><input type="radio" name="inst" value="${esc(i.name)}" ${i.name === st.instance ? 'checked' : ''} ${i.state !== 'open' ? 'data-off="1"' : ''}><span><b>${esc(i.profileName || i.name)}</b><small>${esc(i.name)}${i.number ? ` · +${esc(i.number)}` : ''}</small></span><span class="badge ${cl}">${esc(l)}</span></label>`; }).join('') || '<p class="faint">Nenhum número na Evolution.</p>'}</div>
        <div class="wa-inst-actions"><button class="btn btn-primary btn-sm" id="wa-use">Usar o número selecionado</button><button class="btn btn-ghost btn-sm" id="wa-new">+ Criar número exclusivo</button></div><div id="wa-qr"></div>`;
      $$('.wa-inst input').forEach((r) => r.addEventListener('change', () => $$('.wa-inst').forEach((x) => x.classList.toggle('on', x.contains(r) && r.checked))));
      $('#wa-use').onclick = async () => {
        const r = $('.wa-inst input:checked'); if (!r) return toast('Escolha um número', { error: true });
        if (r.dataset.off && !confirm('Este número não está conectado agora. Usar mesmo assim?')) return;
        try { await api('/api/admin/whatsapp', { method: 'PUT', body: { instance: r.value } }); toast(`Número escolhido: ${r.value}`); reload(); } catch (er) { toast(er.message, { error: true }); }
      };
      $('#wa-new').onclick = () => {
        $('#wa-qr').innerHTML = `<div class="wa-new"><label class="label">Nome do novo número</label><div class="wa-new-row"><span>${esc(st.prefix)}</span><input class="input" id="wa-new-name" value="alunos" maxlength="30"><button class="btn btn-primary btn-sm" id="wa-create">Criar e gerar QR code</button></div><p class="hint">Use um chip só para a plataforma, se possível. Os números de outros sistemas (como o CRM) nunca são alterados.</p></div>`;
        $('#wa-create').onclick = async (ev) => {
          const name = st.prefix + $('#wa-new-name').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
          await withLoading(ev.target, async () => {
            try { const r = await api('/api/admin/whatsapp/instances', { method: 'POST', body: { name } }); showQr(name, r); } catch (er) { toast(er.message, { error: true }); }
          });
        };
      };
    } catch (er) { box.innerHTML = `<div class="alert alert-error">${esc(er.message)}</div>`; }
  };
  const showQr = (name, r) => {
    $('#wa-qr').innerHTML = `<div class="wa-qrbox">${r.qr ? `<img src="${esc(r.qr)}" alt="QR code">` : ''}<div><b>Leia com o WhatsApp do número</b><ol><li>No celular, abra o WhatsApp › <b>Aparelhos conectados</b> › <b>Conectar um aparelho</b>.</li><li>Aponte para o QR code.</li>${r.pairingCode ? `<li>Ou use o código de pareamento: <code>${esc(r.pairingCode)}</code></li>` : ''}</ol><div class="wa-inst-actions"><button class="btn btn-soft btn-sm" id="wa-qr-new">Gerar novo QR code</button><button class="btn btn-primary btn-sm" id="wa-qr-done">Já li, usar este número</button></div></div></div>`;
    $('#wa-qr-new').onclick = async () => { try { showQr(name, await api(`/api/admin/whatsapp/instances/${encodeURIComponent(name)}/qr`)); } catch (er) { toast(er.message, { error: true }); } };
    $('#wa-qr-done').onclick = async () => { try { await api('/api/admin/whatsapp', { method: 'PUT', body: { instance: name } }); toast('Número escolhido. Confira se aparece como Conectado.'); reload(); } catch (er) { toast(er.message, { error: true }); } };
  };
  $('#wa-load')?.addEventListener('click', loadInst);
  if (owner && st.hasKey && !st.instance) loadInst();
  // mensagens
  let focused = $('[data-tpl="tpl_access"]');
  $$('[data-tpl]').forEach((t) => { t.addEventListener('focus', () => (focused = t)); t.addEventListener('input', () => { $(`[data-prev="${t.dataset.tpl}"]`).innerHTML = `${preview(t.value)}<span class="wa-time">09:41 ✓✓</span>`; }); });
  $$('[data-var]').forEach((b) => (b.onclick = () => { if (!focused || focused.disabled) return; const s0 = focused.selectionStart, e0 = focused.selectionEnd; focused.setRangeText(b.dataset.var, s0, e0, 'end'); focused.focus(); focused.dispatchEvent(new Event('input')); }));
  $('#wa-save-tpl')?.addEventListener('click', async (e) => {
    const body = Object.fromEntries($$('[data-tpl]').map((t) => [t.dataset.tpl, t.value]));
    await withLoading(e.target, async () => { try { await api('/api/admin/whatsapp', { method: 'PUT', body }); toast('Mensagens salvas'); } catch (er) { toast(er.message, { error: true }); } });
  });
  $('#wa-test').onclick = async (e) => {
    const phone = $('#wa-test-phone').value.trim(); if (!phone) return toast('Digite o número para o teste', { error: true });
    await withLoading(e.target, async () => {
      try { const r = await api('/api/admin/whatsapp/test', { method: 'POST', body: { phone, kind: $('#wa-test-kind').value } }); r.status === 'sent' ? toast('Teste enviado. Confira o WhatsApp.') : toast(`O teste ${r.status === 'failed' ? 'falhou' : 'ficou na fila'}: ${r.error || ''}`, { error: r.status === 'failed', ms: 7000 }); }
      catch (er) { toast(er.message, { error: true, ms: 7000 }); }
    });
  };
  $('#wa-refresh').onclick = reload;
  $$('[data-resend]').forEach((b) => (b.onclick = async () => { try { await api(`/api/admin/whatsapp/messages/${b.dataset.resend}/resend`, { method: 'POST' }); toast('Reenviando…'); setTimeout(reload, 1200); } catch (er) { toast(er.message, { error: true, ms: 6000 }); } }));
}
