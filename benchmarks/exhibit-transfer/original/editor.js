'use strict';
const item=document.querySelector('#item'), caption=document.querySelector('#caption'), notice=document.querySelector('#notice');
function openLabel(){caption.value=exhibitStore.load(item.value).caption;notice.textContent='';}
async function saveLabel(){
  const label=await exhibitStore.write(item.value,{caption:caption.value});
  caption.value=label.caption;notice.textContent='已保存';
}
document.querySelector('#save').onclick=saveLabel;
item.onchange=openLabel;
caption.oninput=()=>{notice.textContent='未保存'};
openLabel();
