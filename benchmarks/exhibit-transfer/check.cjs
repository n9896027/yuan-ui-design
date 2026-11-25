const { chromium } = require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path'), fs=require('node:fs');
const os = require('node:os');
const expected = {
  original: ['unchanged', 'crossDraft', 'switchDraft', 'sameRecord', 'metadata'],
  candidate: [],
  'original-service': ['unchanged', 'metadata'],
  retry: []
};
(async()=>{
  const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,headless:true});
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'exhibit-layout-'));
  try{
    for(const [name, failures] of Object.entries(expected)) {
      const fixture = path.join(temp,name);
      fs.cpSync(path.join(__dirname,'original'), fixture, { recursive:true });
      if (name === 'candidate' || name === 'retry') fs.cpSync(path.join(__dirname,name),fixture,{recursive:true});
      if (name === 'original-service') fs.copyFileSync(path.join(__dirname,'candidate/editor.js'),path.join(fixture,'editor.js'));
      const ctx=await browser.newContext({offline:true});
      try{
        const p=await ctx.newPage(),errs=[];
        p.on('pageerror',e=>errs.push(e.message));
        await p.goto(pathToFileURL(path.join(fixture,'index.html')).href);
        const input=p.locator('#caption'),sel=p.locator('#item'),save=p.locator('#save');
        const record=id=>p.evaluate(k=>exhibitStore.load(k),id);
        const checks={};
        const original=await record('opal');
        checks.loaded=(await input.inputValue())===original.caption;
        await save.click();await p.waitForTimeout(350);await p.reload();
        checks.unchanged=JSON.stringify(await record('opal'))===JSON.stringify(original) && await input.inputValue()===original.caption;
        await input.fill('');await save.click();await p.waitForTimeout(350);await p.reload();
        checks.clear=await input.inputValue()==='' && (await record('opal')).caption==='';
        await input.fill('新 A');await save.click();
        await sel.selectOption('jasper');await input.fill('新 B 草稿');await p.waitForTimeout(350);
        checks.crossDraft=await input.inputValue()==='新 B 草稿' && (await record('jasper')).caption==='' && !(await p.locator('#notice').innerText()).startsWith('已保存');
        await sel.selectOption('opal');await sel.selectOption('jasper');
        checks.switchDraft=await input.inputValue()==='新 B 草稿';
        await input.fill('B 已提交');await save.click();await input.fill('B 更新的输入');await p.waitForTimeout(350);
        checks.sameRecord=await input.inputValue()==='B 更新的输入' && (await record('jasper')).caption==='B 已提交' && !(await p.locator('#notice').innerText()).startsWith('已保存');
        checks.metadata=(await record('opal')).accession==='OP-04' && (await record('opal')).year===0 && (await record('jasper')).accession==='JS-07';
        checks.noExceptions=errs.length===0;
        const observed = Object.keys(checks).filter(key => !checks[key]);
        require('node:assert/strict').deepEqual(observed, failures);
        console.log(name, Object.keys(checks).length - observed.length + '/8', observed.join(', '));
      }finally{await ctx.close();}
    }
  }finally{try {await browser.close();} finally {fs.rmSync(temp,{recursive:true,force:true});}}
})().catch(e=>{console.error(e);process.exitCode=1});
