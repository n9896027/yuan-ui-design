'use strict';
const item=document.querySelector('#item'), caption=document.querySelector('#caption'), notice=document.querySelector('#notice');
const drafts=new Map(), revisions=new Map();

function revisionFor(id){return revisions.get(id) || 0;}
function draftFor(id){
  if(!drafts.has(id)) drafts.set(id,exhibitStore.load(id).caption);
  return drafts.get(id);
}
function showNotice(message, id=item.value){
  if(item.value===id) notice.textContent=message;
}
function openLabel(){
  const id=item.value;
  caption.value=draftFor(id);
  showNotice('',id);
}
async function saveLabel(){
  const id=item.value, snapshot=caption.value, revision=revisionFor(id);
  drafts.set(id,snapshot);
  showNotice('保存中…',id);
  const label=await exhibitStore.write(id,{caption:snapshot});
  if(item.value!==id || revisionFor(id)!==revision) return;
  drafts.set(id,label.caption);
  caption.value=label.caption;
  showNotice('已保存',id);
}
document.querySelector('#save').onclick=saveLabel;
item.onchange=openLabel;
caption.oninput=()=>{
  const id=item.value;
  drafts.set(id,caption.value);
  revisions.set(id,revisionFor(id)+1);
  showNotice('未保存',id);
};
openLabel();
