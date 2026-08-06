(async function () {
  let data;
  try {
    const response = await fetch("./services.json", { cache: "no-store" });
    if (!response.ok) return;
    data = await response.json();
  } catch {
    return;
  }

  document.querySelectorAll("[data-status-for]").forEach((el) => {
    const key = el.getAttribute("data-status-for");
    const online = data.services?.[key] === true;
    el.classList.toggle("is-online", online);
    el.classList.toggle("is-offline", !online);
    const label = el.querySelector("[data-status-label]");
    if (label) label.textContent = online ? "Online" : "Offline";
  });
})();
