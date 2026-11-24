(() => {
  const key = 'yuan-ui-subtitle-persistence-reference-v1';
  const seed = { a: '旧片段 A。', b: '旧片段 B。', c: '旧片段 C。' };
  const copy = document.querySelector('#copy');
  const notice = document.querySelector('#notice');
  const save = document.querySelector('#save');
  let selected = 'a';
  let heldReceipts = null;
  let revision = 0;
  const drafts = new Map();
  const pending = new Map();

  function readCommitted() {
    const value = localStorage.getItem(key);
    const stored = value === null ? {} : JSON.parse(value);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Invalid record');
    for (const id of Object.keys(seed)) {
      if (id in stored && typeof stored[id] !== 'string') throw new Error('Invalid segment: ' + id);
    }
    return { ...seed, ...stored };
  }
  let committed;
  try {
    committed = readCommitted();
  } catch {
    copy.disabled = true;
    save.disabled = true;
    notice.dataset.state = 'error';
    notice.textContent = '无法读取原字幕。请检查浏览器存储后重新打开。';
    return;
  }
  function persist(id, text) {
    const stored = readCommitted();
    localStorage.setItem(key, JSON.stringify({ ...stored, [id]: text }));
  }
  function show(id) {
    selected = id;
    copy.value = drafts.has(id) ? drafts.get(id).text : committed[id];
    document.querySelectorAll('[data-segment]').forEach(button => button.setAttribute('aria-current', String(button.dataset.segment === id)));
    notice.dataset.state = drafts.has(id) ? 'dirty' : 'saved';
    notice.textContent = drafts.has(id) ? '有未保存更改' : '已载入已保存内容';
  }
  function markDirty() {
    revision += 1;
    drafts.set(selected, { text: copy.value, revision });
    notice.dataset.state = 'dirty';
    notice.textContent = '有未保存更改';
  }
  async function saveCurrent() {
    const draft = drafts.get(selected);
    if (!draft) { notice.dataset.state = 'saved'; notice.textContent = '已是最新保存'; return; }
    const submitted = { id: selected, revision: draft.revision, text: draft.text };
    if (pending.get(selected)?.revision === draft.revision) return;
    pending.set(selected, submitted);
    notice.dataset.state = 'saving';
    notice.textContent = '正在保存';
    await new Promise(resolve => {
      if (heldReceipts) heldReceipts.push(resolve);
      else setTimeout(resolve, 35);
    });
    if (pending.get(submitted.id) !== submitted) return;
    pending.delete(submitted.id);
    try {
      persist(submitted.id, submitted.text);
    } catch {
      if (selected === submitted.id) {
        notice.dataset.state = 'error';
        notice.textContent = '保存失败，当前草稿仍保留，可重试。';
      }
      return;
    }
    committed[submitted.id] = submitted.text;
    const currentDraft = drafts.get(submitted.id);
    if (currentDraft && currentDraft.revision === submitted.revision) drafts.delete(submitted.id);
    if (selected === submitted.id && (!currentDraft || currentDraft.revision === submitted.revision)) {
      copy.value = submitted.text;
      notice.dataset.state = 'saved';
      notice.textContent = '已保存';
    }
  }
  document.querySelectorAll('[data-segment]').forEach(button => button.addEventListener('click', () => show(button.dataset.segment)));
  copy.addEventListener('input', markDirty);
  save.addEventListener('click', saveCurrent);
  copy.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); saveCurrent(); } });
  window.subtitlePersistence = Object.freeze({
    readCommitted,
    storageKey: key,
    hold() { heldReceipts = []; },
    release(index = 0) {
      const resolve = heldReceipts.splice(index, 1)[0];
      if (!resolve) throw new Error('No pending receipt');
      resolve();
    }
  });
  show(selected);
})();
