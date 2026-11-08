/**
 * SafePulse – Main Application Logic
 * Simple, privacy-focused SOS + location sharing + check-in timer PWA
 */

(function () {
  "use strict";

  // ---------- State ----------
  let currentPosition = null;   // { lat, lng, accuracy, timestamp }
  let contacts = [];            // [{ id, name, phone }]
  let selectedMinutes = null;
  let timerInterval = null;
  let timerEndTime = null;

  // ---------- DOM Elements ----------
  const sosBtn           = document.getElementById("sosBtn");
  const statusEl         = document.getElementById("status");
  const locationText     = document.getElementById("locationText");
  const refreshBtn       = document.getElementById("refreshLocation");
  const contactForm      = document.getElementById("contactForm");
  const contactName      = document.getElementById("contactName");
  const contactPhone     = document.getElementById("contactPhone");
  const contactsList     = document.getElementById("contactsList");
  const shareLocationBtn = document.getElementById("shareLocationBtn");

  // Timer elements
  const timerIdle        = document.getElementById("timerIdle");
  const timerActive      = document.getElementById("timerActive");
  const startTimerBtn    = document.getElementById("startTimerBtn");
  const countdownDisplay = document.getElementById("countdownDisplay");
  const timerStatusText  = document.getElementById("timerStatusText");
  const imSafeBtn        = document.getElementById("imSafeBtn");
  const timerOptions     = document.querySelectorAll(".timer-opt");

  // ---------- Helpers ----------
  function setStatus(message, type = "") {
    statusEl.textContent = message;
    statusEl.className = "status " + type;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatPhone(phone) {
    // Keep digits and leading +
    return phone.replace(/[^\d+]/g, "");
  }

  /**
   * Convert Nigerian numbers to international format for WhatsApp
   * 0803... → 234803...
   * +234803... stays
   * 234803... stays
   */
  function toWhatsAppNumber(phone) {
    let cleaned = formatPhone(phone).replace(/\D/g, "");

    // Already starts with 234
    if (cleaned.startsWith("234") && cleaned.length >= 13) {
      return cleaned;
    }
    // Local format starting with 0
    if (cleaned.startsWith("0") && cleaned.length === 11) {
      return "234" + cleaned.slice(1);
    }
    // Sometimes people write 803... without 0
    if (cleaned.length === 10 && /^[789]/.test(cleaned)) {
      return "234" + cleaned;
    }
    // Fallback – return as is
    return cleaned;
  }

  function createMapsLink(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  function createSosMessage(lat, lng, reason = "") {
    const mapsLink = createMapsLink(lat, lng);
    const time = new Date().toLocaleString("en-NG", {
      timeZone: "Africa/Lagos",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short"
    });

    let msg = `EMERGENCY! I need help right now.\n\n`;
    if (reason) msg += `Reason: ${reason}\n\n`;
    msg += `My location: ${mapsLink}\n`;
    msg += `Time: ${time}\n\n`;
    msg += `Sent via SafePulse`;
    return msg;
  }

  // ---------- Location ----------
  function getLocation(force = false) {
    if (!navigator.geolocation) {
      setStatus("Geolocation is not supported on this device.", "error");
      locationText.textContent = "Location not available";
      return;
    }

    setStatus("Getting your location…");

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: force ? 0 : 30000
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp
        };

        const accuracyText = currentPosition.accuracy
          ? ` (±${Math.round(currentPosition.accuracy)} m)`
          : "";

        locationText.innerHTML = `
          <strong>${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)}</strong>
          ${accuracyText}<br>
          <a href="${createMapsLink(currentPosition.lat, currentPosition.lng)}" target="_blank" rel="noopener">
            Open in Google Maps
          </a>
        `;
        setStatus("Location ready", "success");
      },
      (err) => {
        console.error(err);
        let msg = "Could not get location. ";
        if (err.code === 1) msg += "Please allow location permission.";
        else if (err.code === 2) msg += "Position unavailable.";
        else if (err.code === 3) msg += "Request timed out. Try again.";
        else msg += err.message;

        setStatus(msg, "error");
        locationText.textContent = "Location unavailable – check permissions";
      },
      options
    );
  }

  // ---------- Contacts (localStorage) ----------
  function loadContacts() {
    try {
      const raw = localStorage.getItem("safepulse_contacts");
      contacts = raw ? JSON.parse(raw) : [];
    } catch (e) {
      contacts = [];
    }
    renderContacts();
  }

  function saveContacts() {
    localStorage.setItem("safepulse_contacts", JSON.stringify(contacts));
  }

  function renderContacts() {
    contactsList.innerHTML = "";

    if (contacts.length === 0) {
      contactsList.innerHTML = `<li style="color:var(--muted);font-size:0.9rem;">No contacts yet. Add at least one.</li>`;
      return;
    }

    contacts.forEach((c) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="contact-info">
          <span class="contact-name">${escapeHtml(c.name)}</span>
          <span class="contact-phone">${escapeHtml(c.phone)}</span>
        </div>
        <button class="delete-btn" data-id="${c.id}" aria-label="Remove ${escapeHtml(c.name)}">Remove</button>
      `;
      contactsList.appendChild(li);
    });

    contactsList.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        contacts = contacts.filter((c) => c.id !== id);
        saveContacts();
        renderContacts();
        setStatus("Contact removed");
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ---------- SOS Action ----------
  async function triggerSOS(reason = "") {
    if (!currentPosition) {
      setStatus("Getting location first…", "error");
      getLocation(true);
      return;
    }

    if (contacts.length === 0) {
      setStatus("Please add at least one emergency contact first.", "error");
      return;
    }

    const message = createSosMessage(currentPosition.lat, currentPosition.lng, reason);
    const mapsLink = createMapsLink(currentPosition.lat, currentPosition.lng);

    sosBtn.classList.add("pressed");
    setStatus("Preparing emergency message…");

    if (navigator.share) {
      try {
        await navigator.share({
          title: "EMERGENCY – SafePulse",
          text: message,
          url: mapsLink
        });
        setStatus("Share sheet opened. Send to your contacts!", "success");
      } catch (err) {
        fallbackShare(message);
      }
    } else {
      fallbackShare(message);
    }

    setTimeout(() => sosBtn.classList.remove("pressed"), 300);
  }

  function fallbackShare(message) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(message).then(() => {
        setStatus("Message copied! Opening WhatsApp…", "success");
      }).catch(() => {});
    }

    // Open WhatsApp for the first contact with proper Nigerian number format
    const first = contacts[0];
    const waNumber = toWhatsAppNumber(first.phone);
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

    window.open(waUrl, "_blank");

    setTimeout(() => {
      alert("Emergency message ready:\n\n" + message + "\n\nIt has been copied (if supported). Send it via WhatsApp or SMS to your contacts.");
    }, 400);
  }

  // ---------- Check-in Timer ----------
  function updateCountdown() {
    if (!timerEndTime) return;

    const now = Date.now();
    const remaining = Math.max(0, timerEndTime - now);

    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      timerEndTime = null;

      // Timer expired → automatic SOS
      countdownDisplay.textContent = "00:00";
      timerStatusText.textContent = "Timer expired!";
      setStatus("Check-in timer expired – sending emergency alert", "error");

      // Switch UI back
      timerActive.classList.add("hidden");
      timerIdle.classList.remove("hidden");
      startTimerBtn.disabled = true;
      selectedMinutes = null;
      timerOptions.forEach(btn => btn.classList.remove("selected"));

      // Trigger SOS with reason
      triggerSOS("Check-in timer expired – I may need help");
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    countdownDisplay.textContent =
      String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function startTimer(minutes) {
    if (!minutes) return;

    // Make sure we have location
    if (!currentPosition) {
      getLocation(true);
    }

    timerEndTime = Date.now() + minutes * 60 * 1000;
    localStorage.setItem("safepulse_timer_end", timerEndTime.toString());

    timerIdle.classList.add("hidden");
    timerActive.classList.remove("hidden");

    updateCountdown();
    timerInterval = setInterval(updateCountdown, 1000);

    setStatus(`Check-in timer started (${minutes} min). Press “I’m Safe” when you arrive.`, "success");
  }

  function cancelTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerEndTime = null;
    localStorage.removeItem("safepulse_timer_end");

    timerActive.classList.add("hidden");
    timerIdle.classList.remove("hidden");
    startTimerBtn.disabled = true;
    selectedMinutes = null;
    timerOptions.forEach(btn => btn.classList.remove("selected"));

    setStatus("Timer cancelled. You are marked safe.", "success");
  }

  // Restore timer if page was reloaded while timer was running
  function restoreTimerIfNeeded() {
    const saved = localStorage.getItem("safepulse_timer_end");
    if (saved) {
      const end = parseInt(saved, 10);
      if (end > Date.now()) {
        timerEndTime = end;
        timerIdle.classList.add("hidden");
        timerActive.classList.remove("hidden");
        updateCountdown();
        timerInterval = setInterval(updateCountdown, 1000);
        setStatus("Check-in timer still running", "success");
      } else {
        localStorage.removeItem("safepulse_timer_end");
      }
    }
  }

  // ---------- Share Current Location ----------
  function shareCurrentLocation() {
    if (!currentPosition) {
      setStatus("Get location first", "error");
      getLocation(true);
      return;
    }

    const mapsLink = createMapsLink(currentPosition.lat, currentPosition.lng);
    const text = `My current location (SafePulse):\n${mapsLink}`;

    if (navigator.share) {
      navigator.share({
        title: "My Location – SafePulse",
        text: text,
        url: mapsLink
      }).then(() => setStatus("Location shared", "success"))
        .catch(() => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
            setStatus("Location link copied to clipboard", "success");
          } else {
            prompt("Copy this location link:", mapsLink);
          }
        });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setStatus("Location link copied to clipboard", "success");
    } else {
      prompt("Copy this location link:", mapsLink);
    }
  }

  // ---------- Event Listeners ----------
  sosBtn.addEventListener("click", () => triggerSOS());

  // Timer option buttons
  timerOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      timerOptions.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedMinutes = parseInt(btn.dataset.minutes, 10);
      startTimerBtn.disabled = false;
    });
  });

  startTimerBtn.addEventListener("click", () => {
    if (selectedMinutes) startTimer(selectedMinutes);
  });

  imSafeBtn.addEventListener("click", cancelTimer);

  refreshBtn.addEventListener("click", () => getLocation(true));

  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = contactName.value.trim();
    const phone = contactPhone.value.trim();

    if (!name || !phone) return;

    if (contacts.length >= 5) {
      setStatus("Maximum 5 contacts allowed.", "error");
      return;
    }

    contacts.push({
      id: generateId(),
      name,
      phone: formatPhone(phone)
    });

    saveContacts();
    renderContacts();
    contactForm.reset();
    setStatus("Contact added", "success");
  });

  shareLocationBtn.addEventListener("click", shareCurrentLocation);

  // ---------- Service Worker ----------
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("./sw.js")
        .then(() => console.log("Service Worker registered"))
        .catch((err) => console.warn("SW registration failed:", err));
    }
  }

  // ---------- Init ----------
  function init() {
    loadContacts();
    getLocation();
    registerServiceWorker();
    restoreTimerIfNeeded();
    setStatus("Ready. Add contacts and allow location.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
