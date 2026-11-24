// Playwright CLI run-code function for the shared rendered Mock fixture.
// The caller owns navigation, output directory and browser cleanup.
async (page) => {
  await page.reload({waitUntil:'load'});
  await page.setViewportSize({width:1280,height:900});
  const platform=await page.evaluate(()=>navigator.platform);
  await page.locator('[data-eval="generate"]').click();
  const note=page.locator('[data-eval="note-W02"]');
  const original=await note.elementHandle();
  try {
    await note.focus();await page.keyboard.press(/Mac/.test(platform)?'Meta+A':'Control+A');
    const expected='Power checked. Keep this note.';
    const fromStep=await page.evaluate(()=>window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.step);
    await page.keyboard.type(expected,{delay:50});
    await page.waitForFunction(()=>window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status==='completed',null,{timeout:6000});
    const actual=await note.evaluate(el=>({value:el.value,focused:el===document.activeElement,selectionStart:el.selectionStart,selectionEnd:el.selectionEnd}));
    const sameNode=await original.evaluate(el=>el.isConnected&&el===document.querySelector('[data-eval="note-W02"]'));
    const snapshot=await page.evaluate(()=>window.__EVAL_AGENT_INSTANCES__[0].snapshot());
    const passed=actual.value===expected&&actual.focused&&actual.selectionStart===expected.length&&actual.selectionEnd===expected.length&&snapshot.run.step>fromStep;
    const bits=new URL(page.url()).pathname.split('/').filter(Boolean);
    const label=((bits.includes('repairs')?'repaired-':'')+(bits.at(-3)||'page')).replace(/[^a-z0-9_-]/ig,'-');
    const screenshot='output/playwright/'+label+'-agent-stream-typing-viewport.png';
    await page.screenshot({path:screenshot,fullPage:false});
    return {url:page.url(),evidenceLevel:'mock',platform,expected,...actual,sameNode,passed,fromStep,toStep:snapshot.run.step,screenshot,method:'actual keyboard events across observed Mock updates; 50ms interval simulates input, not assertion waiting',limitations:['native IME composition was not tested','DOM identity is diagnostic; the pass criteria are continuous input, focus, caret and observed updates','No real API or physical mobile device tested']};
  } finally {await original.dispose()}
}
