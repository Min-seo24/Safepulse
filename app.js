/**
 * SafePulse – Main Application Logic
 * SOS + location + check-in timer PWA
 * Features: multi-contact SOS, continuous location, vibration, custom timer,
 * confirmation, safe-arrival + destination, shake-to-SOS, battery + GPS chips, Call 112
 */

(function () {
  "use strict";

  let currentPosition = null;
  let contacts = [];
  let selectedMinutes = null;
  let timerInterval = null;
  let timerEndTime = null;
  let watchId = null;
  let lastWarned = false;
  let currentDestination = "";

  const sosBtn = document.getElementById("sosBtn");
  const statusEl = document.getElementById("status");
  const locationText = document.getElementById("locationText");
  const refreshBtn = document.getElementById("refreshLocation");
  const contactForm = document.getElementById("contactForm");
  const contactName = document.getElementById("contactName");
  const contactPhone = document.getElementById("contactPhone");
  const contactsList = document.getElementById("contactsList");
  const shareLocationBtn = document.getElementById("shareLocationBtn");
  const timerIdle = document.getElementById("timerIdle");
  const timerActive = document.getElementById("timerActive");
  const startTimerBtn = document.getElementById("startTimerBtn");
  const countdownDisplay = document.getElementById("countdownDisplay");
  const timerStatusText = document.getElementById("timerStatusText");
  const imSafeBtn = document.getElementById("imSafeBtn");
  const timerOptions = document.querySelectorAll(".timer-opt");
  const customMinutesInput = document.getElementById("customMinutes");
  const destinationInput = document.getElementById("destinationInput");
  const timerDestination = document.getElementById("timerDestination");
  const batteryStatusEl = document.getElementById("batteryStatus");
  const gpsStatusEl = document.getElementById("gpsStatus");
  const sosConfirm = document.getElementById("sosConfirm");
  const sosConfirmYes = document.getElementById("sosConfirmYes");
  const sosConfirmCancel = document.getElementById("sosConfirmCancel");

  function setStatus(message, type = "") {
    statusEl.textContent = message;
    statusEl.className = "status " + type;
  }
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function formatPhone(phone) {
    return phone.replace(/[^\d+]/g, "");
  }
  function toWhatsAppNumber(phone) {
    let cleaned = formatPhone(phone).replace(/\D/g, "");
    if (cleaned.startsWith("234") && cleaned.length >= 13) return cleaned;
    if (cleaned.startsWith("0") && cleaned.length === 11) return "234" + cleaned.slice(1);
    if (cleaned.length === 10 && /^[789]/.test(cleaned)) return "234" + cleaned;
    return cleaned;
  }
  function createMapsLink(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  function createSosMessage(lat, lng, reason = "") {
    const mapsLink = createMapsLink(lat, lng);
    const time = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
    let msg = `EMERGENCY! I need help right now.\n\n`;
    if (reason) msg += `Reason: ${reason}\n\n`;
    msg += `My location: ${mapsLink}\nTime: ${time}\n\nSent via SafePulse`;
    return msg;
  }
  function createSafeArrivalMessage(lat, lng, destination = "") {
    const mapsLink = createMapsLink(lat, lng);
    const time = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
    let msg = `I’ve arrived safely ✅\n\n`;
    if (destination) msg += `Destination: ${destination}\n`;
    msg += `My location: ${mapsLink}\nTime: ${time}\n\nSent via SafePulse`;
    return msg;
  }
  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
  }
  function flashStatus(type) {
    statusEl.classList.add("flash-" + type);
    setTimeout(() => statusEl.classList.remove("flash-" + type), 600);
  }

  function updateGpsChip(accuracy) {
    if (!gpsStatusEl) return;
    if (accuracy == null || isNaN(accuracy)) {
      gpsStatusEl.textContent = "GPS: —";
      gpsStatusEl.className = "status-chip";
      return;
    }
    const m = Math.round(accuracy);
    let label, cls;
    if (m <= 20) { label = `GPS: ±${m}m (Good)`; cls = "status-chip good"; }
    else if (m <= 50) { label = `GPS: ±${m}m (OK)`; cls = "status-chip ok"; }
    else { label = `GPS: ±${m}m (Weak)`; cls = "status-chip weak"; }
    gpsStatusEl.textContent = label;
    gpsStatusEl.className = cls;
  }

  function updateLocationUI(pos) {
    currentPosition = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp
    };
    try { localStorage.setItem("safepulse_last_pos", JSON.stringify(currentPosition)); } catch (e) {}
    const accuracyText = currentPosition.accuracy ? ` (±${Math.round(currentPosition.accuracy)} m)` : "";
    locationText.innerHTML = `
      <strong>${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)}</strong>
      ${accuracyText}<br>
      <a href="${createMapsLink(currentPosition.lat, currentPosition.lng)}" target="_blank" rel="noopener">Open in Google Maps</a>
    `;
    updateGpsChip(currentPosition.accuracy);
  }

  function getLocation(force = false) {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported on this device.", "error");
      locationText.textContent = "Location not available";
      return;
    }
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => { updateLocationUI(pos); setStatus("Location ready", "success"); },
      (err) => {
        let msg = "Could not get location. ";
        if (err.code === 1) msg += "Please allow location permission.";
        else if (err.code === 2) msg += "Position unavailable.";
        else if (err.code === 3) msg += "Request timed out. Try again.";
        else msg += err.message;
        setStatus(msg, "error");
        try {
          const raw = localStorage.getItem("safepulse_last_pos");
          if (raw) {
            currentPosition = JSON.parse(raw);
            locationText.innerHTML = `<strong>${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)}</strong> (last known)<br><a href="${createMapsLink(currentPosition.lat, currentPosition.lng)}" target="_blank" rel="noopener">Open in Google Maps</a>`;
            updateGpsChip(currentPosition.accuracy);
          } else locationText.textContent = "Location unavailable – check permissions";
        } catch (e) { locationText.textContent = "Location unavailable – check permissions"; }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: force ? 0 : 30000 }
    );
  }

  function startWatchingLocation() {
    if (!navigator.geolocation || watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => updateLocationUI(pos),
      (err) => console.warn("watchPosition error:", err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }
  function stopWatchingLocation() {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function loadContacts() {
    try { contacts = JSON.parse(localStorage.getItem("safepulse_contacts") || "[]"); } catch (e) { contacts = []; }
    renderContacts();
  }
  function saveContacts() { localStorage.setItem("safepulse_contacts", JSON.stringify(contacts)); }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function renderContacts() {
    contactsList.innerHTML = "";
    if (contacts.length === 0) {
      contactsList.innerHTML = `<li style="color:var(--muted);font-size:0.9rem;">No contacts yet. Add at least one.</li>`;
      return;
    }
    contacts.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `<div class="contact-info"><span class="contact-name">${escapeHtml(c.name)}</span><span class="contact-phone">${escapeHtml(c.phone)}</span></div><button class="delete-btn" data-id="${c.id}">Remove</button>`;
      contactsList.appendChild(li);
    });
    contactsList.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        contacts = contacts.filter((c) => c.id !== btn.getAttribute("data-id"));
        saveContacts();
        renderContacts();
        setStatus("Contact removed");
      });
    });
  }

  function showSosConfirm() { sosConfirm.classList.remove("hidden"); }
  function hideSosConfirm() { sosConfirm.classList.add("hidden"); }

  async function triggerSOS(reason = "", skipConfirm = false) {
    if (!skipConfirm && !reason) { showSosConfirm(); return; }
    if (!currentPosition) { setStatus("Getting location first…", "error"); getLocation(true); return; }
    if (contacts.length === 0) { setStatus("Please add at least one emergency contact first.", "error"); return; }
    const message = createSosMessage(currentPosition.lat, currentPosition.lng, reason);
    const mapsLink = createMapsLink(currentPosition.lat, currentPosition.lng);
    vibrate([200, 100, 200, 100, 400]);
    sosBtn.classList.add("pressed", "sos-flash");
    setStatus("Preparing emergency message…", "error");
    flashStatus("error");
    if (navigator.share) {
      try {
        await navigator.share({ title: "EMERGENCY – SafePulse", text: message, url: mapsLink });
        setStatus("Share sheet opened. Send to your contacts!", "success");
      } catch (err) { multiContactShare(message); }
    } else multiContactShare(message);
    setTimeout(() => sosBtn.classList.remove("pressed", "sos-flash"), 800);
  }

  function multiContactShare(message, isSafeArrival = false) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message).then(() => {
        setStatus(isSafeArrival ? "Safe arrival message copied! Opening WhatsApp…" : "Message copied! Opening WhatsApp…", "success");
      }).catch(() => {});
    }
    if (contacts.length === 0) return;
    openWhatsAppForContact(contacts[0], message);
    contacts.slice(1).forEach((c, i) => setTimeout(() => openWhatsAppForContact(c, message), (i + 1) * 700));
    setTimeout(() => {
      const names = contacts.map(c => c.name).join(", ");
      alert((isSafeArrival ? "Safe arrival message" : "Emergency message") + " ready.\n\nWhatsApp opened for: " + names + "\n\nPlease tap Send on each chat.");
    }, contacts.length * 700 + 300);
  }
  function openWhatsAppForContact(contact, message) {
    window.open(`https://wa.me/${toWhatsAppNumber(contact.phone)}?text=${encodeURIComponent(message)}`, "_blank");
  }

  async function sendSafeArrival(destination = "") {
    if (!currentPosition) getLocation(true);
    if (contacts.length === 0) { setStatus("No emergency contacts saved.", "error"); return; }
    const lat = currentPosition ? currentPosition.lat : 0;
    const lng = currentPosition ? currentPosition.lng : 0;
    const message = createSafeArrivalMessage(lat, lng, destination);
    vibrate([80, 40, 80, 40, 80]);
    setStatus("Sending “arrived safely” message…", "success");
    if (navigator.share) {
      try {
        await navigator.share({ title: "I’ve arrived safely – SafePulse", text: message, url: currentPosition ? createMapsLink(lat, lng) : undefined });
        setStatus("Safe arrival shared!", "success");
      } catch (err) { multiContactShare(message, true); }
    } else multiContactShare(message, true);
  }

  function updateCountdown() {
    if (!timerEndTime) return;
    const remaining = Math.max(0, timerEndTime - Date.now());
    if (remaining <= 0) {
      clearInterval(timerInterval); timerInterval = null; timerEndTime = null; lastWarned = false;
      stopWatchingLocation();
      vibrate([300, 150, 300, 150, 300, 150, 600]);
      countdownDisplay.textContent = "00:00";
      timerStatusText.textContent = "Timer expired!";
      setStatus("Check-in timer expired – sending emergency alert", "error");
      flashStatus("error");
      timerActive.classList.add("hidden"); timerIdle.classList.remove("hidden");
      startTimerBtn.disabled = true; selectedMinutes = null;
      timerOptions.forEach(btn => btn.classList.remove("selected"));
      if (customMinutesInput) customMinutesInput.value = "";
      triggerSOS("Check-in timer expired – I may need help", true);
      return;
    }
    const totalSeconds = Math.floor(remaining / 1000);
    countdownDisplay.textContent = String(Math.floor(totalSeconds / 60)).padStart(2, "0") + ":" + String(totalSeconds % 60).padStart(2, "0");
    if (remaining <= 120000 && !lastWarned) {
      lastWarned = true;
      vibrate([150, 80, 150]);
      timerStatusText.textContent = "Less than 2 minutes left!";
      countdownDisplay.classList.add("urgent");
    }
  }

  function startTimer(minutes) {
    if (!minutes || minutes < 1) return;
    currentDestination = destinationInput ? destinationInput.value.trim() : "";
    try { localStorage.setItem("safepulse_destination", currentDestination); } catch (e) {}
    if (!currentPosition) getLocation(true);
    startWatchingLocation();
    timerEndTime = Date.now() + minutes * 60 * 1000;
    localStorage.setItem("safepulse_timer_end", timerEndTime.toString());
    lastWarned = false;
    countdownDisplay.classList.remove("urgent");
    timerIdle.classList.add("hidden");
    timerActive.classList.remove("hidden");
    if (timerDestination) {
      if (currentDestination) {
        timerDestination.textContent = "Going to: " + currentDestination;
        timerDestination.classList.remove("hidden");
      } else {
        timerDestination.textContent = "";
        timerDestination.classList.add("hidden");
      }
    }
    updateCountdown();
    timerInterval = setInterval(updateCountdown, 1000);
    vibrate([80, 40, 80]);
    setStatus(`Check-in timer started (${minutes} min)${currentDestination ? " → " + currentDestination : ""}. Press “I’ve Arrived Safely” when you arrive.`, "success");
  }

  function cancelTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerEndTime = null; lastWarned = false;
    localStorage.removeItem("safepulse_timer_end");
    stopWatchingLocation();
    countdownDisplay.classList.remove("urgent");
    timerActive.classList.add("hidden"); timerIdle.classList.remove("hidden");
    startTimerBtn.disabled = true; selectedMinutes = null;
    timerOptions.forEach(btn => btn.classList.remove("selected"));
    if (customMinutesInput) customMinutesInput.value = "";
    if (timerDestination) { timerDestination.textContent = ""; timerDestination.classList.add("hidden"); }
    const dest = currentDestination || localStorage.getItem("safepulse_destination") || "";
    localStorage.removeItem("safepulse_destination");
    currentDestination = "";
    if (destinationInput) destinationInput.value = "";
    sendSafeArrival(dest);
  }

  function restoreTimerIfNeeded() {
    const saved = localStorage.getItem("safepulse_timer_end");
    if (saved) {
      const end = parseInt(saved, 10);
      if (end > Date.now()) {
        timerEndTime = end;
        currentDestination = localStorage.getItem("safepulse_destination") || "";
        timerIdle.classList.add("hidden"); timerActive.classList.remove("hidden");
        if (timerDestination) {
          if (currentDestination) {
            timerDestination.textContent = "Going to: " + currentDestination;
            timerDestination.classList.remove("hidden");
          } else timerDestination.classList.add("hidden");
        }
        startWatchingLocation();
        updateCountdown();
        timerInterval = setInterval(updateCountdown, 1000);
        setStatus("Check-in timer still running" + (currentDestination ? " → " + currentDestination : ""), "success");
      } else {
        localStorage.removeItem("safepulse_timer_end");
        localStorage.removeItem("safepulse_destination");
      }
    }
  }

  function shareCurrentLocation() {
    if (!currentPosition) { setStatus("Get location first", "error"); getLocation(true); return; }
    const mapsLink = createMapsLink(currentPosition.lat, currentPosition.lng);
    const text = `My current location (SafePulse):\n${mapsLink}`;
    if (navigator.share) {
      navigator.share({ title: "My Location – SafePulse", text, url: mapsLink })
        .then(() => setStatus("Location shared", "success"))
        .catch(() => { if (navigator.clipboard) { navigator.clipboard.writeText(text); setStatus("Location link copied", "success"); } else prompt("Copy this link:", mapsLink); });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text); setStatus("Location link copied", "success");
    } else prompt("Copy this link:", mapsLink);
  }

  function updateStartButtonState() {
    const customVal = customMinutesInput ? parseInt(customMinutesInput.value, 10) : NaN;
    startTimerBtn.disabled = !(selectedMinutes !== null || (!isNaN(customVal) && customVal >= 1 && customVal <= 720));
  }

  function initBattery() {
    if (!navigator.getBattery || !batteryStatusEl) return;
    navigator.getBattery().then((battery) => {
      function update() {
        const level = Math.round(battery.level * 100);
        const charging = battery.charging ? " ⚡" : "";
        let cls = "status-chip";
        if (level <= 15) cls += " weak";
        else if (level <= 30) cls += " ok";
        else cls += " good";
        batteryStatusEl.textContent = `Battery: ${level}%${charging}`;
        batteryStatusEl.className = cls;
      }
      update();
      battery.addEventListener("levelchange", update);
      battery.addEventListener("chargingchange", update);
    }).catch(() => { if (batteryStatusEl) batteryStatusEl.textContent = "Battery: —"; });
  }

  let lastShakeTime = 0, lastX = null, lastY = null, lastZ = null;
  function handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;
    const x = acc.x || 0, y = acc.y || 0, z = acc.z || 0;
    if (lastX !== null) {
      const delta = Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ);
      if (delta > 28) {
        const now = Date.now();
        if (now - lastShakeTime > 4000) {
          lastShakeTime = now;
          vibrate([100, 50, 100, 50, 200]);
          setStatus("Shake detected – preparing SOS…", "error");
          triggerSOS("Shake-to-SOS activated", true);
        }
      }
    }
    lastX = x; lastY = y; lastZ = z;
  }
  function initShakeToSOS() {
    if (!window.DeviceMotionEvent) return;
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission().then((state) => {
        if (state === "granted") window.addEventListener("devicemotion", handleMotion, true);
      }).catch(() => {});
    } else {
      window.addEventListener("devicemotion", handleMotion, true);
    }
  }

  sosBtn.addEventListener("click", () => triggerSOS());
  sosConfirmYes.addEventListener("click", () => { hideSosConfirm(); triggerSOS("", true); });
  sosConfirmCancel.addEventListener("click", hideSosConfirm);
  sosConfirm.addEventListener("click", (e) => { if (e.target === sosConfirm) hideSosConfirm(); });
  timerOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      timerOptions.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedMinutes = parseInt(btn.dataset.minutes, 10);
      if (customMinutesInput) customMinutesInput.value = "";
      updateStartButtonState();
    });
  });
  if (customMinutesInput) {
    customMinutesInput.addEventListener("input", () => {
      timerOptions.forEach(b => b.classList.remove("selected"));
      selectedMinutes = null;
      updateStartButtonState();
    });
  }
  startTimerBtn.addEventListener("click", () => {
    let minutes = selectedMinutes;
    if (!minutes && customMinutesInput) minutes = parseInt(customMinutesInput.value, 10);
    if (minutes && minutes >= 1) startTimer(minutes);
  });
  imSafeBtn.addEventListener("click", cancelTimer);
  refreshBtn.addEventListener("click", () => getLocation(true));
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = contactName.value.trim(), phone = contactPhone.value.trim();
    if (!name || !phone) return;
    if (contacts.length >= 5) { setStatus("Maximum 5 contacts allowed.", "error"); return; }
    contacts.push({ id: generateId(), name, phone: formatPhone(phone) });
    saveContacts(); renderContacts(); contactForm.reset();
    setStatus("Contact added", "success");
  });
  shareLocationBtn.addEventListener("click", shareCurrentLocation);

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("SW failed:", err));
    }
  }

  function init() {
    loadContacts();
    getLocation();
    registerServiceWorker();
    restoreTimerIfNeeded();
    initBattery();
    setTimeout(initShakeToSOS, 800);
    setStatus("Ready. Add contacts and allow location.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
