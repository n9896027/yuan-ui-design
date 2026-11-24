// Targeted follow-up regression for the shared Mock, not a new blind A/B score.
// The caller owns navigation, output directory and browser cleanup.
async (page) => {
  const results=[],errors=[];
  const onError=e=>errors.push(String(e));page.on('pageerror',onError);
  const control=key=>page.locator('[data-eval="'+key+'"]');
  const snapshot=()=>page.evaluate(()=>window.__EVAL_AGENT_INSTANCES__[0].snapshot());
  const expect=(condition,message)=>{if(!condition)throw new Error(message)};
  const check=async(name,fn)=>{try{results.push({name,status:'passed',detail:await fn()})}catch(e){results.push({name,status:'failed',detail:String(e.message||e)})}};
  try {
    await page.reload({waitUntil:'load'});await control('generate').click();
    await page.waitForFunction(()=>window.__EVAL_AGENT_INSTANCES__[0].snapshot().run.status==='completed',null,{timeout:6000});
    await check('selection-retained-and-stale-review-invalidated',async()=>{
      await control('select-W02').uncheck();await control('note-W01').fill('Coordinator edit.');
      expect(!await control('select-W02').isChecked(),'W02 silently reselected after an update');
      const sends=(await snapshot()).stats.sendCalls;await control('review-send').click();
      const text=await page.locator('#review-list').innerText();
      expect(text.includes('W01')&&text.includes('W03')&&!text.includes('W02'),'review scope differs from selection');
      expect((await snapshot()).stats.sendCalls===sends,'review performed a send before confirmation');
      await control('note-W01').fill('Changed after review.');
      expect(await page.locator('#review').isHidden(),'changed content left stale confirmation actionable');
      expect((await snapshot()).stats.sendCalls===sends,'editing caused a send');
      return {excluded:'W02',staleReviewHidden:true,sendCalls:sends};
    });
    await check('literal-notes-and-confirmation',async()=>{
      const literal='备注 </textarea><b data-probe="literal-only">字面文本</b> & < >\n第二行';
      await control('note-W01').fill(literal);await control('note-W03').fill('Another source update.');
      expect(await control('note-W01').inputValue()===literal,'note changed after update');
      expect(await page.locator('[data-probe="literal-only"]').count()===0,'text became HTML');
      expect(await page.locator('textarea').count()===3,'note damaged adjacent controls');
      await control('select-W02').check();await control('review-send').click();
      expect((await page.locator('#review-list').innerText()).includes(literal),'review omits exact note content');
      expect(await page.locator('[data-probe="literal-only"]').count()===0,'review interpreted text as HTML');
      return {literal,interpretedElements:0};
    });
    await check('unknown-query-does-not-resend',async()=>{
      await control('confirm-send').click();
      await page.waitForFunction(()=>{const s=window.__EVAL_AGENT_INSTANCES__[0].snapshot().send;return s.W01==='sent'&&s.W02==='sent'&&s.W03==='unknown'},null,{timeout:6000});
      const partial=await snapshot();expect(partial.stats.sendCalls===1,'expected exactly one send');
      expect(await control('select-W03').isDisabled()&&await control('review-send').isDisabled(),'unknown result still sendable');
      expect(await control('send-status-W03').getAttribute('data-state')==='unknown','unknown state not visible');
      await control('query-status').click();const final=await snapshot();
      expect(final.send.W03==='sent'&&final.stats.sendCalls===partial.stats.sendCalls&&final.stats.queryCalls===1,'query added a send or failed to sync result');
      expect(await control('review-send').isDisabled(),'already sent jobs can be sent again');
      return {before:partial.send,after:final.send,sendCalls:final.stats.sendCalls,queryCalls:final.stats.queryCalls,source:'shared synchronous Mock snapshot'};
    });
  } finally {page.off('pageerror',onError)}
  return {url:page.url(),evidenceLevel:'mock',results,pageErrors:errors,limitations:['Tests the fixture DOM/data-eval contract only','Mock query is synchronous; real service semantics and server idempotency were not tested','Follow-up regression, excluded from initial A/B results']};
}
