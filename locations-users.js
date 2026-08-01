// ============================================================
// 儲位管理 / 使用者管理 / 改密碼
// ============================================================
document.getElementById("addLocBtn").addEventListener("click", async ()=>{
  const code = document.getElementById("newLocInput").value.trim();
  if(!code){ alert("請輸入儲位代碼"); return; }
  if(locationsCache.some(l=>l.code===code)){ alert("這個儲位代碼已經存在"); return; }
  await db.collection("locations").add({code});
  document.getElementById("newLocInput").value = "";
});

function renderLocations(){
  const body = document.getElementById("locBody");
  body.innerHTML = locationsCache.map(l=>
    `<tr><td>${escapeHtml(l.code)}</td><td><button data-del="${l.id}" data-code="${escapeHtml(l.code)}">刪除</button></td></tr>`
  ).join("") || `<tr><td colspan="2" class="empty">尚無儲位</td></tr>`;
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>deleteLocation(b.dataset.del, b.dataset.code)));
}

function deleteLocation(locId, code){
  const blocking = itemsCache.filter(it=> locQty((it.locations||{})[code]) > 0);
  if(blocking.length){
    const detail = blocking.map(it=>`${it.brand} ${it.spec}：${locQty(it.locations[code])}`).join("\n");
    alert(`這個儲位還有庫存，無法直接刪除。請先把以下品項搬到其他儲位：\n\n${detail}`);
    return;
  }
  if(confirm(`確定要刪除儲位「${code}」嗎？`)){
    db.collection("locations").doc(locId).delete();
  }
}

document.getElementById("newUserBtn").addEventListener("click", openNewUserModal);

function userRolesOf(u){
  return (Array.isArray(u.roles) && u.roles.length) ? u.roles : (u.role==="admin" ? ["admin"] : ["sales","warehouse"]);
}
function roleCheckboxGroupHtml(checkedRoles){
  return ROLE_DEFS.map(r=>`<label class="role-checkbox"><input type="checkbox" value="${r.id}" ${checkedRoles.includes(r.id)?'checked':''}> ${r.label}</label>`).join("");
}
function readCheckedRoles(){
  return Array.from(document.querySelectorAll('#modalSheet .role-checkbox input[type=checkbox]:checked')).map(el=>el.value);
}

function renderUsers(){
  const body = document.getElementById("userBody");
  body.innerHTML = usersCache.map(u=>`<tr>
    <td>${escapeHtml(u.name)}</td>
    <td>${escapeHtml(u.username)}</td>
    <td>${escapeHtml(userRolesLabel(userRolesOf(u)))}</td>
    <td><span class="badge ${u.active!==false?'on':'off'}">${u.active!==false?'啟用':'停用'}</span></td>
    <td>
      <button data-toggle="${u.id}" data-active="${u.active!==false}">${u.active!==false?'停用':'啟用'}</button>
      <button data-edit="${u.id}">編輯</button>
      <button data-del="${u.id}" data-name="${escapeHtml(u.name)}">刪除</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="5" class="empty">尚無使用者</td></tr>`;
  body.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click", ()=>{
    const newActive = b.dataset.active !== "true";
    db.collection("users").doc(b.dataset.toggle).update({active:newActive});
  }));
  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=> editUser(b.dataset.edit)));
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=> deleteUser(b.dataset.del, b.dataset.name)));
}

function editUser(uid){
  const u = usersCache.find(x=>x.id===uid);
  if(!u) return;
  const curRoles = userRolesOf(u);
  const html = `
    <div class="sheet-head"><h2>編輯使用者</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>姓名</label><input type="text" id="editUserName" value="${escapeHtml(u.name)}"></div>
    <div class="form-row"><label>角色（可複選，一人可身兼多職）</label>
      <div class="role-checkbox-group">${roleCheckboxGroupHtml(curRoles)}</div>
    </div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="editUserSaveBtn">儲存</button>
    </div>`;
  openModal(html);
  document.getElementById("editUserSaveBtn").addEventListener("click", ()=>{
    const newName = document.getElementById("editUserName").value.trim();
    const roles = readCheckedRoles();
    if(!roles.length){ alert("請至少勾選一個角色"); return; }
    db.collection("users").doc(uid).update({
      name: newName || u.name, roles, role: roles.includes("admin") ? "admin" : "member"
    }).then(()=>closeModal()).catch(e=>alert("更新失敗："+e.message));
  });
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
    <div class="form-row"><label>角色（可複選，一人可身兼多職，例如業務兼倉管）</label>
      <div class="role-checkbox-group">${roleCheckboxGroupHtml(["sales","warehouse"])}</div>
    </div>
    <div class="note">初始密碼請當面或用其他管道告知員工，系統不會保存明文密碼，事後也無法查回。忘記密碼請用「刪除」後重新建立帳號，或請該員工自行用「改密碼」設定新密碼。</div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="newUserSubmitBtn">建立帳號</button>
    </div>`;
  openModal(html);
  document.getElementById("newUserSubmitBtn").addEventListener("click", async ()=>{
    const name = document.getElementById("newUserName").value.trim();
    const uname = document.getElementById("newUserUsername").value.trim();
    const pw = document.getElementById("newUserPassword").value;
    const roles = readCheckedRoles();
    if(!name || !uname || !pw){ alert("請填寫完整資料"); return; }
    if(!roles.length){ alert("請至少勾選一個角色"); return; }
    const email = uname + "@" + INTERNAL_EMAIL_DOMAIN;
    try{
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pw);
      await db.collection("users").doc(cred.user.uid).set({
        name, username:uname, roles, role: roles.includes("admin") ? "admin" : "member", active:true
      });
      await secondaryAuth.signOut();
      closeModal();
    }catch(e){
      alert("建立失敗：" + e.message);
    }
  });
}
