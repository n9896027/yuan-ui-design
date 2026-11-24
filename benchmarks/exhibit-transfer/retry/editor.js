'use strict';
const item = document.querySelector('#item');
const caption = document.querySelector('#caption');
const notice = document.querySelector('#notice');
const drafts = new Map();
const queues = new Map();

function currentDraft() {
  if (!drafts.has(item.value)) {
    const record = exhibitStore.load(item.value);
    drafts.set(item.value, { text: record.caption, revision: 0, status: '' });
  }
  return drafts.get(item.value);
}

function show() {
  const draft = currentDraft();
  caption.value = draft.text;
  notice.textContent = draft.status;
}

function save() {
  const id = item.value;
  const draft = currentDraft();
  const { text, revision } = draft;
  draft.status = '保存中…';
  notice.textContent = draft.status;
  const previous = queues.get(id) || Promise.resolve();
  const pending = previous.then(async () => {
    const record = exhibitStore.load(id);
    if (record.caption !== text) {
      await exhibitStore.write(id, { ...record, caption: text });
    }
  });
  queues.set(id, pending.catch(() => {}));
  function finish(status) {
    if (draft.revision !== revision) return;
    draft.status = status;
    if (item.value === id) notice.textContent = status;
  }
  pending.then(() => finish('已保存'), () => finish('保存失败，草稿已保留'));
}

document.querySelector('#save').onclick = save;
item.onchange = show;
caption.oninput = () => {
  const draft = currentDraft();
  draft.text = caption.value;
  draft.revision++;
  draft.status = '未保存';
  notice.textContent = draft.status;
};
show();
