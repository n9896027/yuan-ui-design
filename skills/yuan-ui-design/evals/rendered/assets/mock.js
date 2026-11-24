(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const storageKey = 'ui-rendered-ab-maintenance';
  window.EvaluationStore = {
    readJobs() { const saved=JSON.parse(localStorage.getItem(storageKey)||'{}'); return EVAL_DATA.jobs.map(job=>({...clone(job),...(saved[job.id]||{})})); },
    async saveJob(id, patch, {fail=false}={}) { await Promise.resolve(); if(fail) throw new Error('模拟保存失败'); const saved=JSON.parse(localStorage.getItem(storageKey)||'{}'); saved[id]={...(saved[id]||{}),...patch}; localStorage.setItem(storageKey,JSON.stringify(saved)); return this.readJobs().find(job=>job.id===id); }
  };
  window.__EVAL_AGENT_INSTANCES__=[];
  window.EvaluationAgent = class {
    constructor() { this.listeners=new Set();this.counter=0;this.timers=[];this.state={run:{id:null,status:'idle',step:0},draft:[],send:{},stats:{generateCalls:0,cancelCalls:0,sendCalls:0,queryCalls:0}};window.__EVAL_AGENT_INSTANCES__.push(this); }
    snapshot() { return clone(this.state); }
    subscribe(listener) { this.listeners.add(listener);listener(this.snapshot());return ()=>this.listeners.delete(listener); }
    emit() { for(const listener of this.listeners)listener(this.snapshot()); }
    clearTimers() { this.timers.forEach(clearTimeout);this.timers=[]; }
    generate() { this.clearTimers();this.state.stats.generateCalls++;this.state.run={id:'run-'+(++this.counter),status:'running',step:0};this.state.draft=EVAL_DATA.jobs.slice(0,3).map(job=>({...clone(job),note:'正在拟定安排…',edited:false}));this.state.send={};this.emit();
      [350,700,1050,1400,1750,2100].forEach((delay,index)=>this.timers.push(setTimeout(()=>{if(this.state.run.status==='cancelled')return;this.state.run.step=index+1;const row=this.state.draft[index%3];if(!row.edited)row.note=EVAL_DATA.jobs[index%3].note+(index>=3?' 现场复核后安排。':'');if(index===5&&this.state.run.status!=='cancel_requested')this.state.run.status='completed';this.emit();},delay)));return this.state.run.id; }
    editNote(id,note) { const row=this.state.draft.find(item=>item.id===id);if(row){row.note=note;row.edited=true;this.emit();} }
    cancel() { if(!['running','cancel_requested'].includes(this.state.run.status))return;this.state.stats.cancelCalls++;this.state.run.status='cancel_requested';this.emit();this.timers.push(setTimeout(()=>{this.clearTimers();this.state.run.status='cancelled';this.emit();},350)); }
    send(ids) { this.state.stats.sendCalls++;ids.forEach(id=>{this.state.send[id]='pending';});this.emit();ids.forEach((id,index)=>this.timers.push(setTimeout(()=>{this.state.send[id]=index===2?'unknown':'sent';this.emit();},200*(index+1)))); }
    queryStatus() { this.state.stats.queryCalls++;for(const [id,status] of Object.entries(this.state.send))if(status==='unknown')this.state.send[id]='sent';this.emit(); }
  };
})();
