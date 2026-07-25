  db.collection("users").doc(uid).update({ name: newName.trim() || u.name, role })
    .catch(e=>alert("更新失敗："+e.message));
}

function deleteUser(uid, name){
  if(uid === currentUser.uid){ alert("不能刪除自己目前登入中的帳號"); return; }
  if(!confirm(`確定要刪除使用者「${name}」嗎？\n刪除後此帳號會完全無法登入系統（無法復原，需要重新建立帳號）。`)) return;
  db.collection("users").doc(uid).delete()
    .then(()=>alert("已刪除，此帳號已無法登入系統。"))
    .catch(e=>alert("刪除失敗："+e.message));
}

document.getElementById("changePwBtn").addEventListener("click", async ()=>{
  if(!currentUser) return;
  const oldPw = prompt("請先輸入目前的密碼（用來確認身分）：");
  if(oldPw === null) return;
  const newPw = prompt("請輸入新密碼（至少6碼）：");
  if(newPw === null) return;
  if(!newPw || newPw.length < 6){ alert("新密碼至少要6碼"); return; }
  try{
    const email = currentUser.username + "@" + INTERNAL_EMAIL_DOMAIN;
    const cred = firebase.auth.EmailAuthProvider.credential(email, oldPw);
    await auth.currentUser.reauthenticateWithCredential(cred);
    await auth.currentUser.updatePassword(newPw);
    await db.collection("users").doc(currentUser.uid).update({ pwNote: newPw }).catch(()=>{});
    alert("密碼修改成功，下次登入請用新密碼。");
  }catch(e){
    alert("修改失敗：" + (e.code==='auth/wrong-password' ? "目前密碼輸入錯誤" : e.message));
  }
});

function openNewUserModal(){
  const html = `
    <div class="sheet-head"><h2>新增使用者</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>姓名</label><input type="text" id="newUserName"></div>
    <div class="form-row"><label>帳號（不用email格式，簡單英數即可）</label><input type="text" id="newUserUsername"></div>
    <div class="form-row"><label>初始密碼</label><input type="text" id="newUserPassword" value="123456"></div>
    <div class="form-row"><label>角色</label>
      <select id="newUserRole"><option value="member">員工</option><option value="admin">管理者</option></select>
    </div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="newUserSubmitBtn">建立帳號</button>
    </div>`;
  openModal(html);
  document.getElementById("newUserSubmitBtn").addEventListener("click", async ()=>{
    const name = document.getElementById("newUserName").value.trim();
    const uname = document.getElementById("newUserUsername").value.trim();
    const pw = document.getElementById("newUserPassword").value;
    const role = document.getElementById("newUserRole").value;
    if(!name || !uname || !pw){ alert("請填寫完整資料"); return; }
    const email = uname + "@" + INTERNAL_EMAIL_DOMAIN;
    try{
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pw);
      await db.collection("users").doc(cred.user.uid).set({name, username:uname, role, active:true, pwNote: pw});
      await secondaryAuth.signOut();
      closeModal();
    }catch(e){
      alert("建立失敗：" + e.message);
    }
  });
}

document.getElementById("clearDataBtn").addEventListener("click", async ()=>{
  if(!confirm("確定要清除所有「品項」與「儲位」資料嗎？（不會動到使用者帳號跟進出貨紀錄）這通常是為了重新匯入正確的資料才做，確定要繼續嗎？")) return;
  const statusEl = document.getElementById("importStatus");
  statusEl.textContent = "清除中...";
  const itemsSnap = await db.collection("items").get();
  const locSnap = await db.collection("locations").get();
  const allDocs = [...itemsSnap.docs, ...locSnap.docs];
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }
  statusEl.textContent = `已清除 ${itemsSnap.size} 筆品項與 ${locSnap.size} 筆儲位資料，可以重新選檔匯入了。`;
});

document.getElementById("importBtn").addEventListener("click", async ()=>{
  const fileInput = document.getElementById("importFile");
  const statusEl = document.getElementById("importStatus");
  if(!fileInput.files.length){ alert("請先選擇檔案"); return; }
  statusEl.textContent = "讀取檔案中...";
  const file = fileInput.files[0];
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:"array"});

  if(wb.Sheets["品項主檔"] && wb.Sheets["儲位主檔"]){
    await restoreFullBackup(wb, statusEl);
    return;
  }

  if(await tryImportSailunSheet(wb, statusEl)) return;

  const knownLocationCodes = new Set(locationsCache.map(l=>l.code));
  const newItems = [];

  const sheet1 = wb.Sheets["已比對成功(總倉屏東分開)"];
  if(sheet1){
    const rows = XLSX.utils.sheet_to_json(sheet1);
    rows.forEach(r=>{
      const zongCode = (r["總倉儲位代碼"] || "總倉(未指定儲位)").toString().trim();
      const zongQty = Number(r["總倉數量"]) || 0;
      const pingQty = Number(r["屏東數量"]) || 0;
      const yearRaw = (r["年分"] || "").toString().trim() || null;
      const locs = {};
      if(zongQty > 0){ locs[zongCode] = {qty:zongQty, productionDate:yearRaw}; knownLocationCodes.add(zongCode); }
      if(pingQty > 0){ locs["屏東"] = {qty:pingQty, productionDate:yearRaw}; knownLocationCodes.add("屏東"); }
      const costVal = r["成本(已套1.25)"];
      newItems.push({
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: locs, remark: r["備註"] || "",
        twenty: (costVal === undefined || costVal === null || costVal === "") ? null : Number(costVal),
        sellPrice: null
      });
    });
  }

  const sheet2 = wb.Sheets["其他品牌(此檔未涵蓋位區成本)"];
  if(sheet2){
    const rows = XLSX.utils.sheet_to_json(sheet2);
    rows.forEach(r=>{
      const zongQty = Number(r["總倉數量"]) || 0;
      const pingQty = Number(r["屏東數量"]) || 0;
      const locs = {};
      if(zongQty > 0){ locs["總倉(未指定儲位)"] = {qty:zongQty, productionDate:null}; knownLocationCodes.add("總倉(未指定儲位)"); }
      if(pingQty > 0){ locs["屏東"] = {qty:pingQty, productionDate:null}; knownLocationCodes.add("屏東"); }
      newItems.push({
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: locs, remark: r["備註"] || "", twenty: null, sellPrice: null
      });
    });
  }

  if(newItems.length === 0){ statusEl.textContent = "找不到可匯入的分頁，請確認上傳的是「庫存資料整併結果.xlsx」"; return; }

  statusEl.textContent = `匯入中...共 ${newItems.length} 筆品項，${knownLocationCodes.size} 個儲位`;

  for(const code of knownLocationCodes){
    if(!locationsCache.some(l=>l.code===code)){
      await db.collection("locations").add({code});
    }
  }

  let count = 0;
  while(count < newItems.length){
    const batch = db.batch();
    const chunk = newItems.slice(count, count+400);
    chunk.forEach(it=>{
      const ref = db.collection("items").doc();
      batch.set(ref, it);
    });
    await batch.commit();
    count += chunk.length;
    statusEl.textContent = `匯入中...已完成 ${count}/${newItems.length}`;
  }

  statusEl.textContent = `匯入完成！共新增 ${newItems.length} 筆品項。可以到「庫存查詢」或「庫存總表」查看。`;
});

function parseLocSummaryText(str){
  const locs = {};
  if(!str || str === "-") return locs;
  str.toString().split("、").forEach(pair=>{
    const m = /^(.+)×(\d+)(?:\((.+)\))?$/.exec(pair.trim());
    if(!m) return;
    const code = m[1];
    if(!locs[code]) locs[code] = [];
    locs[code].push({ qty: Number(m[2]), productionDate: m[3] || null });
  });
  return locs;
}

function parseKybLocSummaryText(str){
  const locs = {};
  if(!str || str === "-") return locs;
  str.toString().split("、").forEach(pair=>{
    const m = /^(.+)×(\d+)$/.exec(pair.trim());
    if(!m) return;
    locs[m[1]] = Number(m[2]);
  });
  return locs;
}

function detectSailunSheet(wb){
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, blankrows:true});
    for(let r=0; r<Math.min(rows.length, 10); r++){
      const row = rows[r] || [];
      if(row.includes("品名規格") && row.includes("花紋")){
        return { rows, headerRowIndex: r };
      }
    }
  }
  return null;
}

async function tryImportSailunSheet(wb, statusEl){
  const detected = detectSailunSheet(wb);
  if(!detected) return false;

  const header = detected.rows[detected.headerRowIndex];
  const specIdx = header.indexOf("品名規格");
  const modelIdx = header.indexOf("花紋");
  const twentyIdx = modelIdx + 1;
  const priceIdx = modelIdx + 2;
  const remarkIdx = header.indexOf("備註");

  const dataRows = detected.rows.slice(detected.headerRowIndex + 1);
  const merged = new Map();
  let skippedCount = 0;

  dataRows.forEach(row=>{
    if(!row) return;
    const specRaw = row[specIdx];
    const modelRaw = row[modelIdx];
    const specStr = (specRaw==null?"":specRaw).toString().trim();
    const modelStr = (modelRaw==null?"":modelRaw).toString().trim();
    if(!specStr && !modelStr) return;
    const remarkStr = remarkIdx>=0 ? (row[remarkIdx]==null?"":row[remarkIdx].toString()) : "";
    if(remarkStr.includes("下市")){ skippedCount++; return; }
    const twentyRaw = row[twentyIdx];
    const priceRaw = row[priceIdx];
    const key = norm(specStr) + "|" + norm(modelStr);
    merged.set(key, {
      spec: specStr, model: modelStr,
      twenty: (twentyRaw===null||twentyRaw===undefined||twentyRaw==="") ? null : Number(twentyRaw),
      sellPrice: (priceRaw===null||priceRaw===undefined||priceRaw==="") ? null : Number(priceRaw)
    });
  });

  const rowsToApply = Array.from(merged.values());
  statusEl.textContent = `偵測到賣輪總表，共 ${rowsToApply.length} 筆規格（已跳過備註含「下市」的 ${skippedCount} 筆），匯入中...`;

  let created = 0, updated = 0;
  let batch = db.batch();
  let opCount = 0;
  for(const r of rowsToApply){
    const existing = itemsCache.find(it=> norm(it.brand)===norm("賣輪Sailun") && norm(it.spec)===norm(r.spec) && norm(it.model)===norm(r.model));
    if(existing){
      batch.update(db.collection("items").doc(existing.id), { twenty: r.twenty, sellPrice: r.sellPrice });
      updated++;
    } else {
      const ref = db.collection("items").doc();
      batch.set(ref, { brand:"賣輪Sailun", model:r.model, spec:r.spec, remark:"", locations:{}, twenty:r.twenty, sellPrice:r.sellPrice });
      created++;
    }
    opCount++;
    if(opCount >= 400){ await batch.commit(); batch = db.batch(); opCount = 0; }
  }
  if(opCount > 0) await batch.commit();

  statusEl.textContent = `賣輪總表匯入完成！新增 ${created} 筆、更新20%／售價 ${updated} 筆（跳過備註含「下市」的 ${skippedCount} 筆）。`;
  return true;
}

async function restoreFullBackup(wb, statusEl){
  const hasKybSheets = !!(wb.Sheets["KYB品項主檔"] || wb.Sheets["KYB儲位主檔"] || wb.Sheets["KYB進出貨紀錄"]);
  const ok = confirm(
    "偵測到這是「完整備份」檔案。\n\n" +
    "還原會先清除目前所有品項、儲位、進出貨紀錄" + (hasKybSheets ? "（含輪胎與KYB兩邊）" : "（這份備份沒有KYB資料，只會還原輪胎，KYB維持現狀不動）") + "，換成這份備份「當時」的內容（含當時的成本、儲位、生產日期）。\n" +
    "此動作無法復原，請確認這是你要的備份時間點。\n\n確定要繼續還原嗎？"
  );
  if(!ok){ statusEl.textContent = "已取消還原。"; return; }

  statusEl.textContent = "清除目前資料中...";
  const itemsSnap = await db.collection("items").get();
  const locSnap = await db.collection("locations").get();
  const txnSnap = await db.collection("transactions").get();
  let allDocs = [...itemsSnap.docs, ...locSnap.docs, ...txnSnap.docs];
  if(hasKybSheets){
    const kybItemsSnap = await db.collection("kybItems").get();
    const kybLocSnap = await db.collection("kybLocations").get();
    const kybTxnSnap = await db.collection("kybTransactions").get();
    allDocs = allDocs.concat(kybItemsSnap.docs, kybLocSnap.docs, kybTxnSnap.docs);
  }
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }

  const itemRows = XLSX.utils.sheet_to_json(wb.Sheets["品項主檔"] || {});
  const locRows = XLSX.utils.sheet_to_json(wb.Sheets["儲位主檔"] || {});
  const txnRows = wb.Sheets["進出貨紀錄"] ? XLSX.utils.sheet_to_json(wb.Sheets["進出貨紀錄"]) : [];

  let count = 0;
  while(count < itemRows.length){
    const batch = db.batch();
    itemRows.slice(count, count+400).forEach(r=>{
      const id = (r["id"] || "").toString().trim();
      if(!id) return;
      batch.set(db.collection("items").doc(id), {
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: parseLocSummaryText(r["儲位分布"]),
        twenty: (r["20%"] === undefined || r["20%"] === null || r["20%"] === "") ? null : Number(r["20%"]),
        sellPrice: (r["售價"] === undefined || r["售價"] === null || r["售價"] === "") ? null : Number(r["售價"]),
        remark: r["備註"] || ""
      });
    });
    await batch.commit();
    count += 400;
    statusEl.textContent = `還原品項中...${Math.min(count,itemRows.length)}/${itemRows.length}`;
  }

  count = 0;
  while(count < locRows.length){
    const batch = db.batch();
    locRows.slice(count, count+400).forEach(r=>{
      const code = (r["儲位代碼"] || "").toString().trim();
      if(!code) return;
      batch.set(db.collection("locations").doc(), {code});
    });
    await batch.commit();
    count += 400;
  }

  count = 0;
  while(count < txnRows.length){
    const batch = db.batch();
    txnRows.slice(count, count+400).forEach(r=>{
      batch.set(db.collection("transactions").doc(), {
        itemId: r["itemId"] || "",
        type: r["type"] || "in",
        qty: Number(r["qty"]) || 0,
        loc: r["loc"] || "",
        date: r["date"] || todayStr(),
        operator: r["operator"] || "",
        editLog: []
      });
    });
    await batch.commit();
    count += 400;
    statusEl.textContent = `還原進出貨紀錄中...${Math.min(count,txnRows.length)}/${txnRows.length}`;
  }

  let kybItemRows = [], kybLocRows = [], kybTxnRows = [];
  if(hasKybSheets){
    kybItemRows = wb.Sheets["KYB品項主檔"] ? XLSX.utils.sheet_to_json(wb.Sheets["KYB品項主檔"]) : [];
    kybLocRows = wb.Sheets["KYB儲位主檔"] ? XLSX.utils.sheet_to_json(wb.Sheets["KYB儲位主檔"]) : [];
    kybTxnRows = wb.Sheets["KYB進出貨紀錄"] ? XLSX.utils.sheet_to_json(wb.Sheets["KYB進出貨紀錄"]) : [];

    count = 0;
    while(count < kybItemRows.length){
      const batch = db.batch();
      kybItemRows.slice(count, count+400).forEach(r=>{
        const id = (r["id"] || "").toString().trim();
        if(!id) return;
        batch.set(db.collection("kybItems").doc(id), {
          carModel: r["車型"] || "", brand: "KYB",
          locations: parseKybLocSummaryText(r["儲位分布"]),
          listPrice: (r["訂價"] === undefined || r["訂價"] === null || r["訂價"] === "") ? null : Number(r["訂價"]),
          catalogPrice: (r["牌價"] === undefined || r["牌價"] === null || r["牌價"] === "") ? null : Number(r["牌價"]),
          warrantyPrice: (r["保修廠"] === undefined || r["保修廠"] === null || r["保修廠"] === "") ? null : Number(r["保修廠"]),
          remark: r["備註"] || ""
        });
      });
      await batch.commit();
      count += 400;
      statusEl.textContent = `還原KYB品項中...${Math.min(count,kybItemRows.length)}/${kybItemRows.length}`;
    }

    count = 0;
    while(count < kybLocRows.length){
      const batch = db.batch();
      kybLocRows.slice(count, count+400).forEach(r=>{
        const code = (r["儲位代碼"] || "").toString().trim();
        if(!code) return;
        batch.set(db.collection("kybLocations").doc(), {code});
      });
      await batch.commit();
      count += 400;
    }

    count = 0;
    while(count < kybTxnRows.length){
      const batch = db.batch();
      kybTxnRows.slice(count, count+400).forEach(r=>{
        batch.set(db.collection("kybTransactions").doc(), {
          itemId: r["itemId"] || "",
          type: r["type"] || "in",
          qty: Number(r["qty"]) || 0,
          loc: r["loc"] || "",
          date: r["date"] || todayStr(),
          operator: r["operator"] || "",
          editLog: []
        });
      });
      await batch.commit();
      count += 400;
      statusEl.textContent = `還原KYB進出貨紀錄中...${Math.min(count,kybTxnRows.length)}/${kybTxnRows.length}`;
    }
  }

  statusEl.textContent = `還原完成！共還原 ${itemRows.length} 筆品項、${locRows.length} 個儲位、${txnRows.length} 筆進出貨紀錄`
    + (hasKybSheets ? `，以及KYB ${kybItemRows.length} 筆車型、${kybLocRows.length} 個儲位、${kybTxnRows.length} 筆進出貨紀錄` : "（這份備份沒有KYB資料，KYB維持原狀）")
    + `（提醒：每筆紀錄過去的逐次編輯歷程無法透過Excel完整保留，但庫存數量、成本、儲位、生產日期都已正確還原）。`;
}

function detectKybSheet(wb){
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, blankrows:true});
    for(let r=0; r<Math.min(rows.length, 10); r++){
      const row = rows[r] || [];
      if(row.includes("車型") && row.includes("訂價") && row.includes("牌價")){
        return { rows, headerRowIndex: r };
      }
    }
  }
  return null;
}

async function tryImportKybSheet(wb, statusEl){
  const detected = detectKybSheet(wb);
  if(!detected) return false;

  const header = detected.rows[detected.headerRowIndex];
  const modelIdx = header.indexOf("車型");
  const listIdx = header.indexOf("訂價");
  const catalogIdx = header.indexOf("牌價");
  const warrantyIdx = header.indexOf("保修廠");

  const dataRows = detected.rows.slice(detected.headerRowIndex + 1);
  const merged = new Map();
  let skippedNoteCount = 0;
  dataRows.forEach(row=>{
    if(!row) return;
    const modelRaw = row[modelIdx];
    const modelStr = (modelRaw==null?"":modelRaw).toString().trim();
    if(!modelStr) return;
    if(modelStr.length > 30){ skippedNoteCount++; return; }
    const toNum = (v)=> (v===null||v===undefined||v==="") ? null : Number(v);
    merged.set(norm(modelStr), {
      carModel: modelStr,
      listPrice: toNum(row[listIdx]),
      catalogPrice: toNum(row[catalogIdx]),
      warrantyPrice: warrantyIdx>=0 ? toNum(row[warrantyIdx]) : null
    });
  });

  const rowsToApply = Array.from(merged.values());
  statusEl.textContent = `偵測到KYB報價單，共 ${rowsToApply.length} 筆車型${skippedNoteCount?`（已跳過看起來像備註文字的 ${skippedNoteCount} 列）`:""}，匯入中...`;

  let created = 0, updated = 0;
  let batch = db.batch();
  let opCount = 0;
  for(const r of rowsToApply){
    const existing = kybItemsCache.find(it=> norm(it.carModel)===norm(r.carModel));
    if(existing){
      batch.update(db.collection("kybItems").doc(existing.id), {
        listPrice: r.listPrice, catalogPrice: r.catalogPrice, warrantyPrice: r.warrantyPrice
      });
      updated++;
    } else {
      const ref = db.collection("kybItems").doc();
      batch.set(ref, {
        carModel: r.carModel, brand: "KYB", remark: "", locations: {},
        listPrice: r.listPrice, catalogPrice: r.catalogPrice, warrantyPrice: r.warrantyPrice
      });
      created++;
    }
    opCount++;
    if(opCount >= 400){ await batch.commit(); batch = db.batch(); opCount = 0; }
  }
  if(opCount > 0) await batch.commit();

  statusEl.textContent = `KYB報價單匯入完成！新增 ${created} 筆車型、更新 ${updated} 筆價格${skippedNoteCount?`（已跳過看起來像備註文字的 ${skippedNoteCount} 列）`:""}。`;
  return true;
}

document.getElementById("kybClearDataBtn").addEventListener("click", async ()=>{
  if(!confirm("確定要清除所有「KYB車型」與「KYB儲位」資料嗎？（不會動到輪胎資料，也不會動到KYB的進出貨紀錄）這通常是為了重新匯入正確的資料才做，確定要繼續嗎？")) return;
  const statusEl = document.getElementById("kybImportStatus");
  statusEl.textContent = "清除中...";
  const itemsSnap = await db.collection("kybItems").get();
  const locSnap = await db.collection("kybLocations").get();
