function openModal(html){
  document.getElementById("modalSheet").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
  const scrollY = window.scrollY;
  document.body.dataset.scrollY = scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = "100%";
}
function closeModal(){
  document.getElementById("modalOverlay").classList.add("hidden");
  document.getElementById("modalSheet").innerHTML = "";
  const scrollY = Number(document.body.dataset.scrollY || 0);
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  window.scrollTo(0, scrollY);
}
document.getElementById("modalOverlay").addEventListener("click", (e)=>{
  if(e.target.id === "modalOverlay") closeModal();
});
