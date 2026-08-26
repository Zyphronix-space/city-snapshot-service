const API_BASE = "http://localhost:8080/api";

const form = document.getElementById("snapshot-form");
const resultEl = document.getElementById("result");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const city = document.getElementById("city").value.trim();
  const currency = document.getElementById("currency").value;
  const button = form.querySelector("button");

  button.disabled = true;
  resultEl.innerHTML = "<p>Loading…</p>";

  try {
    const res = await fetch(
      `${API_BASE}/snapshot/${encodeURIComponent(city)}?currency=${currency}`
    );
    const data = await res.json();

    if (!res.ok) {
      resultEl.innerHTML = `<p class="error">${data.message ?? "Something went wrong."}</p>`;
      return;
    }

    resultEl.innerHTML = `
      <div class="card">
        <h2>${data.city}, ${data.country}</h2>
        <div class="row"><span class="label">Weather</span><span>${data.weather_description}</span></div>
        <div class="row"><span class="label">Temperature</span><span>${data.temperature_celsius} °C</span></div>
        <div class="row"><span class="label">Wind speed</span><span>${data.windspeed_kmh} km/h</span></div>
        <div class="row"><span class="label">Exchange rate</span><span>1 ${data.base_currency} = ${data.exchange_rate} ${data.target_currency}</span></div>
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<p class="error">Could not reach the API — is the Ballerina service running on port 8080?</p>`;
  } finally {
    button.disabled = false;
  }
});
