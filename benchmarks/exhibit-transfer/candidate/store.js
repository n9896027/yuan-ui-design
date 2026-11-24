'use strict';
const exhibitStore = (() => {
  const initial = {opal:{caption:'欧泊 · A',accession:'OP-04',year:0},jasper:{caption:'',accession:'JS-07',year:1977}};
  function rows(){return JSON.parse(localStorage.getItem('gallery-v2') || JSON.stringify(initial))}
  return Object.freeze({
    load(id){return structuredClone(rows()[id])},
    async write(id, record){await new Promise(r=>setTimeout(r,240));const db=rows();db[id]={...db[id],...structuredClone(record)};localStorage.setItem('gallery-v2',JSON.stringify(db));return structuredClone(db[id])}
  });
})();
