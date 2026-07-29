// 完整交接備份：保留所有業務資料的原始欄位與文件 ID。
const HANDOVER_SHEETS = [
  ["brands","交接_品牌","品牌"], ["items","交接_輪胎品項","輪胎品項"], ["locations","交接_輪胎儲位","輪胎儲位"],
  ["transactions","交接_輪胎進出貨","輪胎進出貨"], ["orders","交接_輪胎訂單","輪胎訂單"],
  ["kybItems","交接_KYB品項","KYB品項"], ["kybLocations","交接_KYB儲位","KYB儲位"],
  ["kybTransactions","交接_KYB進出貨","KYB進出貨"], ["kybOrders","交接_KYB訂單","KYB訂單"], ["editLogs","交接_編輯紀錄","編輯紀錄"]
];

async function exportFullBackup(){
  try{
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      {項目:"備份格式",值:"正享完整交接備份"}, {項目:"版本",值:"2"}, {項目:"匯出時間",值:new Date().toISOString()},
      {項目:"帳號說明",值:"Firebase 登入帳號與密碼不會寫入 Excel；請先在新 Firebase 建立管理者帳號。"}
    ]), "交接資訊");
    await Promise.all(HANDOVER_SHEETS.map(async ([collection,sheet])=>{
      const snap = await db.collection(collection).get();
      const rows = snap.docs.map(d=>({id:d.id,資料_JSON:JSON.stringify(d.data())}));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows,{header:["id","資料_JSON"]}), sheet);
    }));
    const users = await db.collection("users").get();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(users.docs.map(d=>{const u=d.data()||{}; return {id:d.id,帳號:u.username||"",姓名:u.name||"",角色:u.role||"",啟用:u.active!==false};}),{header:["id","帳號","姓名","角色","啟用"]}), "交接_使用者設定");
    XLSX.writeFile(wb, `完整交接備份_${todayStr()}.xlsx`);
  }catch(e){ alert("完整交接備份失敗："+e.message); }
}

function handoverRows(wb,sheet){
  const ws=wb.Sheets[sheet]; if(!ws) throw new Error(`缺少工作表：${sheet}`);
  const ids=new Set();
  return XLSX.utils.sheet_to_json(ws,{defval:""}).map((r,i)=>{
    const id=String(r.id||"").trim();
    if(!id || ids.has(id)) throw new Error(`${sheet} 第 ${i+2} 列 id 無效或重複`);
    ids.add(id);
    try{ const data=JSON.parse(r.資料_JSON); if(!data||typeof data!=="object"||Array.isArray(data)) throw new Error(); return {id,data}; }
    catch(e){ throw new Error(`${sheet} 第 ${i+2} 列資料格式錯誤`); }
  });
}

async function restoreHandoverBackup(wb,statusEl){
  let backups;
  try{ backups=new Map(HANDOVER_SHEETS.map(([collection,sheet])=>[collection,handoverRows(wb,sheet)])); }
  catch(e){ statusEl.textContent="交接備份檢查失敗："+e.message; return; }
  const total=Array.from(backups.values()).reduce((n,rows)=>n+rows.length,0);
  const summary=HANDOVER_SHEETS.map(([collection,,label])=>`${label} ${backups.get(collection).length} 筆`).join("、");
  if(!confirm(`偵測到完整交接備份。\n\n將清除新 Firebase 的業務資料，再依原本 ID 還原：\n${summary}\n\n登入帳號與密碼不會由 Excel 還原；請保留目前的管理者帳號，並在還原後重建其他帳號。\n\n此動作無法復原，確定繼續嗎？`)){ statusEl.textContent="已取消交接還原。"; return; }
  statusEl.textContent="清除新 Firebase 的業務資料中...";
  for(const [collection] of HANDOVER_SHEETS){
    const snap=await db.collection(collection).get();
    for(let i=0;i<snap.docs.length;i+=400){ const batch=db.batch(); snap.docs.slice(i,i+400).forEach(d=>batch.delete(d.ref)); await batch.commit(); }
  }
  let done=0;
  for(const [collection,,label] of HANDOVER_SHEETS){
    const rows=backups.get(collection);
    for(let i=0;i<rows.length;i+=400){ const batch=db.batch(); rows.slice(i,i+400).forEach(r=>batch.set(db.collection(collection).doc(r.id),r.data)); await batch.commit(); done+=Math.min(400,rows.length-i); statusEl.textContent=`還原${label}中...${done}/${total}`; }
  }
  statusEl.textContent=`完整交接還原完成！已還原 ${done} 筆業務資料。使用者帳號與密碼需在新 Firebase 另外建立。`;
}