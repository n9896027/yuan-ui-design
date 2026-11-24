// playwright-cli run-code harness.  The caller owns navigation and the browser session.
async (page) => {
  const OUTPUT = 'output/playwright';
  const startedUrl = page.url();
  const pathBits = new URL(startedUrl).pathname.split('/').filter(Boolean);
  const runsAt = pathBits.lastIndexOf('runs');
  const label = ((pathBits.includes('repairs') ? 'repaired-' : '')+(runsAt >= 0 ? pathBits[runsAt + 1] : pathBits[pathBits.length - 2] || pathBits[pathBits.length - 1] || 'page'))
    .replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/ig, '-').replace(/^-+|-+$/g, '') || 'page';
  const out = { url: startedUrl, scenario: null, results: [], console: [], pageErrors: [], requestFailed: [], screenshots: [] };
  const timeout = 7000;

  const onConsole = msg => out.console.push({ type: msg.type(), text: msg.text() });
  const onPageError = error => out.pageErrors.push(String(error && (error.stack || error.message || error)));
  const onRequestFailed = request => out.requestFailed.push({ url: request.url(), failure: request.failure() && request.failure().errorText });
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);

  const record = async (name, fn) => {
    try {
      const value = await fn();
      if (value && value.blocked) out.results.push({ name, status: 'blocked', detail: value.detail || 'required control is absent' });
      else if (value === false) out.results.push({ name, status: 'failed', detail: 'assertion returned false' });
      else out.results.push({ name, status: 'passed', detail: value && value.detail });
    } catch (error) {
      out.results.push({ name, status: 'failed', detail: String(error && (error.message || error)) });
    }
  };
  const blocked = detail => ({ blocked: true, detail });
  const expect = (condition, detail) => { if (!condition) throw new Error(detail); };

  // data-eval is the evaluation contract: do not let copy or incidental controls
  // satisfy a behavioural assertion.
  const control = async (key) => {
    const escaped = key.replace(/"/g, '\\"');
    const candidate = page.locator(`[data-eval="${escaped}"]`);
    const count = await candidate.count().catch(() => 0);
    for (let index = 0; index < Math.min(count, 8); index++) {
      const item = candidate.nth(index);
      if (await item.isVisible().catch(() => false)) return item;
    }
    return null;
  };
  const status = async key => control(key);
  const click = async key => {
    const node = await control(key);
    if (!node) return null;
    await node.click({ timeout });
    return node;
  };
  const actionable = async (node, name) => {
    await node.scrollIntoViewIfNeeded({ timeout });
    const box = await node.boundingBox();
    expect(!!box && box.width > 1 && box.height > 1, `${name} has no visible box`);
    const clear = await node.evaluate(el => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === el || el.contains(top));
    });
    expect(clear, `${name} is covered at its pointer target`);
    return box;
  };
  const shot = async (state) => {
    const filename = `${OUTPUT}/${label}-${out.scenario || 'unknown'}-${state}.png`;
    try {
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({ path: filename, fullPage: true, timeout }); out.screenshots.push(filename);
      const viewportFile=filename.replace(/\.png$/,'-viewport.png');
      await page.screenshot({path:viewportFile,fullPage:false,animations:'disabled',timeout});out.screenshots.push(viewportFile);
    }
    catch (error) { out.results.push({ name: `screenshot:${state}`, status: 'failed', detail: String(error.message || error) }); }
  };
  const setViewport = async (width, height, state) => {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => document.documentElement.clientWidth === window.innerWidth, null, { timeout: 1500 }).catch(() => {});
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
    out.results.push({ name: `layout:${width}`, status: overflow.scrollWidth <= overflow.width + 1 ? 'passed' : 'failed', detail: `scrollWidth=${overflow.scrollWidth}, viewport=${overflow.width}` });
    if (state) await shot(state);
  };
  const stateOf = async () => page.evaluate(() => {
    const instances = window.__EVAL_AGENT_INSTANCES__;
    return instances && instances[0] && typeof instances[0].snapshot === 'function' ? instances[0].snapshot() : null;
  });
  const waitAgent = async (predicate, description) => {
    await page.waitForFunction(predicate, null, { timeout });
    return { detail: description };
  };

  try {
    // Listeners are already registered, so this also reports boot-time errors.
    await page.reload({ waitUntil: 'domcontentloaded', timeout });
    const has = async key => !!(await control(key));
    if (await has('filter-data') || await has('study-thermal')) out.scenario = 'research';
    else if (await has('edit-W02') || await has('fail-save')) out.scenario = 'operations';
    else if (await has('generate') || await has('review-send')) out.scenario = 'agent';
    if (out.scenario === 'research') {
      await setViewport(1280, 900, 'desktop-list');
      await setViewport(390, 844, 'mobile-initial');
      await setViewport(1280, 900, null);
      await record('research:开放数据筛选', async () => {
        if (!await click('filter-data')) return blocked('filter-data');
        const thermal = await control('study-thermal');
        expect(!!thermal, '开放数据筛选后未显示 thermal 研究');
        const hiddenTitles = await page.evaluate(() => EVAL_DATA.studies.filter(item=>item.type!=='开放数据').map(item=>item.title));
        for (const title of hiddenTitles) {
          const matches=page.getByText(title,{exact:true});
          for(let i=0;i<await matches.count();i++) expect(!await matches.nth(i).isVisible(), '筛选后仍可见其他类型研究：'+title);
        }
      });
      await record('research:thermal详情与缺测边界', async () => {
        if (!await click('study-thermal')) return blocked('study-thermal');
        const boundary = await control('data-boundary');
        expect(!!boundary, '详情未呈现缺测/采样边界');
        const copy = await boundary.innerText();
        expect(/缺测|采样|不可推断/.test(copy), '边界说明未说明缺测或采样限制');
      });
      await setViewport(390, 844, 'mobile-detail');
      await setViewport(320, 844, null);
      await record('research:返回列表', async () => {
        if (!await click('detail-back')) return blocked('detail-back');
        expect(!!(await control('filter-all')), '返回后未回到研究列表');
      });
      await record('research:mailto联系', async () => {
        const link = await control('contact');
        if (!link) return blocked('contact');
        expect((await link.getAttribute('href')) === 'mailto:contact@tide-lab.example', '联系链接必须为指定 mailto');
      });
    } else if (out.scenario === 'operations') {
      const marker = '维修备注：失败保留本次修改，确认供电后再检修。';
      await page.evaluate(() => localStorage.removeItem('ui-rendered-ab-maintenance'));
      await page.reload({ waitUntil: 'domcontentloaded', timeout });
      await setViewport(1280, 900, 'desktop-initial');
      await setViewport(390, 844, 'mobile-initial');
      await setViewport(1280, 900, null);
      await record('ops:编辑W02并失败不落盘', async () => {
        if (!await click('edit-W02')) return blocked('edit-W02');
        const device = await control('device');
        const note = await control('note');
        const failure = await control('fail-save');
        const save = await control('save');
        if (!device || !note || !failure || !save) return blocked('device/note/fail-save/save');
        expect((await device.inputValue()).includes('东岸观测站'), 'W02 编辑器未加载正确设备');
        await note.fill(marker);
        await failure.check();
        // In the narrow form, the table may precede the editor; only the whole page
        // must avoid horizontal overflow, so bring the real action into view first.
        await page.setViewportSize({ width: 390, height: 844 });
        await actionable(save, 'save');
        await save.click();
        const feedback = await status('save-status');
        expect(!!feedback && await feedback.isVisible(), '失败保存后没有可见反馈');
        expect((await feedback.getAttribute('data-state')) === 'error', '失败保存状态不是 error');
        expect((await note.inputValue()) === marker, '失败保存后编辑中的备注被丢失');
        const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('ui-rendered-ab-maintenance') || '{}').W02);
        expect(!persisted || persisted.note !== marker, '失败保存意外写入 localStorage');
      });
      await setViewport(390, 844, 'mobile-error');
      await setViewport(320, 844, null);
      await record('ops:重试成功且刷新保留', async () => {
        const failure = await control('fail-save');
        const save = await control('save');
        if (!failure || !save) return blocked('fail-save/save');
        await failure.uncheck();
        await actionable(save, 'save');
        await save.click();
        const feedback = await status('save-status');
        await page.waitForFunction(() => {
          const n = document.querySelector('[data-eval="save-status"]');
          return n && n.getAttribute('data-state') === 'saved';
        }, null, { timeout });
        expect((await feedback.getAttribute('data-state')) === 'saved', '重试后不是 saved');
        await page.reload({ waitUntil: 'domcontentloaded', timeout });
        const edit = await control('edit-W02');
        expect(!!edit, '刷新后找不到 W02 编辑入口');
        await edit.click();
        const note = await control('note');
        expect((await note.inputValue()) === marker, '刷新后 W02 备注未保留');
      });
      await record('ops:键盘保存主路径', async () => {
        const note = await control('note'); const save = await control('save');
        if (!note || !save) return blocked('note/save');
        const keyboardMarker = `${marker}-keyboard`;
        await actionable(save, 'save');
        await note.focus();
        await page.keyboard.press('Meta+A');
        await page.keyboard.type(keyboardMarker);
        let reachedSave = false;
        for (let index = 0; index < 32; index++) {
          await page.keyboard.press('Tab');
          reachedSave = await save.evaluate(el => document.activeElement === el);
          if (reachedSave) break;
        }
        expect(reachedSave, 'Tab 键无法到达保存按钮');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => {
          const n = document.querySelector('[data-eval="save-status"]');
          return n && n.getAttribute('data-state') === 'saved';
        }, null, { timeout });
        const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('ui-rendered-ab-maintenance') || '{}').W02);
        expect(!!persisted && persisted.note === keyboardMarker, '键盘保存没有真实写入 W02 localStorage');
      });
    } else if (out.scenario === 'agent') {
      const edited = '已核对供电，请保留协调员的这条安排备注。';
      let editFocusPreserved = null;
      let editCaretPreserved = null;
      await setViewport(1280, 900, 'desktop-idle');
      await setViewport(390, 844, 'mobile-initial');
      await setViewport(1280, 900, null);
      await record('agent:生成中手改W02不被覆盖', async () => {
        if (!await click('generate')) return blocked('generate');
        const run = await status('run-status');
        if (!run) return blocked('run-status');
        await page.waitForFunction(() => window.__EVAL_AGENT_INSTANCES__ && window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status === 'running', null, { timeout });
        expect((await run.getAttribute('data-state')) === 'running', 'run-status 未反映 Mock 的 running 状态');
        const note = await control('note-W02');
        if (!note) return blocked('note-W02');
        await note.fill(edited);
        await note.evaluate(element=>element.setSelectionRange(5,5));
        await waitAgent(() => window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status === 'completed', 'generation completed after hand edit');
        expect((await note.inputValue()) === edited, '整轮生成完成后覆盖了手改 W02 备注');
        editFocusPreserved = await note.evaluate(element => element === document.activeElement);
        editCaretPreserved = await note.evaluate(element => element.selectionStart===5 && element.selectionEnd===5);
      });
      await record('agent:流式更新保留编辑焦点', async () => {
        if (editFocusPreserved === null) return blocked('hand-edit prerequisite not completed');
        expect(editFocusPreserved, '流式更新后备注仍在，但编辑焦点已丢失，持续键盘输入会中断');
        expect(editCaretPreserved, '流式更新后插入点移动，持续编辑会写入错误位置');
      });
      await setViewport(390, 844, 'mobile-completed-hand-edit');
      await setViewport(320, 844, null);
      await record('agent:停止请求及确认', async () => {
        if (!await click('generate')) return blocked('generate');
        await waitAgent(() => window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status === 'running', 'fresh run started');
        if (!await click('cancel')) return blocked('cancel');
        await waitAgent(() => window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status === 'cancel_requested', 'cancel requested');
        const requested = await status('run-status');
        expect(!!requested && (await requested.getAttribute('data-state')) === 'cancel_requested', 'run-status 未让停止请求状态可辨');
        await waitAgent(() => window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status === 'cancelled', 'cancel confirmed');
        const snapshot = await stateOf();
        expect(snapshot.stats.cancelCalls >= 1, 'Mock stats 未记录 cancel 调用');
        const run = await status('run-status');
        expect(!!run && (await run.getAttribute('data-state')) === 'cancelled', 'run-status 未反映 cancelled 确认');
        await page.setViewportSize({ width: 390, height: 844 });
        await shot('mobile-cancelled');
      });
      await record('agent:完成状态可辨', async () => {
        if (!await click('generate')) return blocked('generate');
        await waitAgent(() => window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status === 'completed', 'generation completed');
        const run = await status('run-status');
        expect(!!run && (await run.getAttribute('data-state')) === 'completed', 'run-status 未反映 completed');
        await shot('mobile-completed');
      });
      await record('agent:审阅前不发送，部分完成并查询', async () => {
        const before = await stateOf();
        for (const key of ['select-W01', 'select-W02', 'select-W03']) {
          const box = await control(key);
          if (!box) return blocked(key);
          await box.check();
        }
        if (!await click('review-send')) return blocked('review-send');
        expect((await stateOf()).stats.sendCalls === before.stats.sendCalls, '进入审阅即发送了项目');
        await shot('mobile-review');
        if (!await click('confirm-send')) return blocked('confirm-send');
        await page.waitForFunction(() => {
          const s = window.__EVAL_AGENT_INSTANCES__[0].snapshot().send;
          return s.W01 === 'sent' && s.W02 === 'sent' && s.W03 === 'unknown';
        }, null, { timeout });
        const partial = await stateOf();
        expect(partial.stats.sendCalls === before.stats.sendCalls + 1, 'Mock stats 未记录一次发送');
        for (const [key, expected] of [['send-status-W01', 'sent'], ['send-status-W02', 'sent'], ['send-status-W03', 'unknown']]) {
          const item = await status(key);
          expect(!!item && (await item.getAttribute('data-state')) === expected, `${key} 未反映 ${expected}`);
        }
        await shot('mobile-partial-send');
        if (!await click('query-status')) return blocked('query-status');
        await page.waitForFunction(() => window.__EVAL_AGENT_INSTANCES__[0].snapshot().send.W03 === 'sent', null, { timeout });
        const final = await stateOf();
        expect(final.stats.queryCalls >= 1, 'Mock stats 未记录查询');
        const w03 = await status('send-status-W03');
        expect(!!w03 && (await w03.getAttribute('data-state')) === 'sent', '查询后 W03 可见状态未更新为 sent');
      });
    } else {
      out.results.push({ name: 'scenario-detection', status: 'blocked', detail: 'no brief selector family was found in this page' });
    }
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onRequestFailed);
  }
  out.summary = out.results.reduce((all, item) => { all[item.status] = (all[item.status] || 0) + 1; return all; }, {});
  return out;
}
