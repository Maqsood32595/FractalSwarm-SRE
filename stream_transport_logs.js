const fs = require('fs');
const path = require('path');

async function fetchTransportStatus() {
  console.log("=== Querying Transport for London (TfL) Public API ===");
  try {
    const res = await fetch("https://api.tfl.gov.uk/Line/Mode/tube,overground,dlr/Status");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const incidents = [];
    data.forEach(line => {
      if (line.lineStatuses) {
        line.lineStatuses.forEach(status => {
          if (status.statusSeverity !== 10) { // 10 is Good Service
            incidents.push({
              line: line.name,
              severity: status.statusSeverityDescription,
              reason: status.reason || "Operational delays reported on line."
            });
          }
        });
      }
    });

    // If London transit is running perfectly with 0 active incidents, 
    // inject mock transit incidents for robust and predictable demo testing
    if (incidents.length === 0) {
      console.log("ℹ️ London transit is running smoothly. Injecting mock incidents for demo...");
      incidents.push({
        line: "Bakerloo Line",
        severity: "Minor Delays",
        reason: "Bakerloo Line: Minor delays due to a signal failure at Queen's Park."
      });
      incidents.push({
        line: "District Line",
        severity: "Part Suspended",
        reason: "District Line: Part suspended between Earl's Court and Richmond due to points failure."
      });
      incidents.push({
        line: "Piccadilly Line",
        severity: "Minor Delays",
        reason: "Piccadilly Line: Minor delays due to temporary speed restrictions."
      });
    }

    // Limit to at most 3 incidents to fit within Gemini's free tier rate limit
    const activeIncidents = incidents.slice(0, 3);
    console.log(`Sending top ${activeIncidents.length} transit incidents to FractalSwarm (with rate limit mitigation delay)...`);

    // Ingest into our Log Ingestion Service
    const port = process.env.PORT || 3002;
    for (const incident of activeIncidents) {
      const alertLog = `TfL ALERT [${incident.line} - ${incident.severity}]: ${incident.reason}`;
      console.log(` -> Ingesting: "${alertLog}"`);
      await fetch(`http://localhost:${port}/api/log-ingest/alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorLog: alertLog })
      });
      // Sleep 2.5 seconds to prevent Google API rate limiting (429)
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    
    console.log("\n==========================================================");
    console.log("🚀 TfL TELEMETRY INGESTION COMPLETE!");
    console.log("==========================================================");
  } catch (e) {
    console.warn("⚠️ TfL API fetch failed or was rate-limited. Falling back to mock transit telemetry...");
    const incidents = [
      {
        line: "Bakerloo Line",
        severity: "Minor Delays",
        reason: "Bakerloo Line: Minor delays due to a signal failure at Queen's Park."
      },
      {
        line: "District Line",
        severity: "Part Suspended",
        reason: "District Line: Part suspended between Earl's Court and Richmond due to points failure."
      },
      {
        line: "Piccadilly Line",
        severity: "Minor Delays",
        reason: "Piccadilly Line: Minor delays due to temporary speed restrictions."
      }
    ];

    try {
      const port = process.env.PORT || 3002;
      for (const incident of incidents) {
        const alertLog = `TfL ALERT [${incident.line} - ${incident.severity}]: ${incident.reason}`;
        console.log(` -> Ingesting (Fallback): "${alertLog}"`);
        await fetch(`http://localhost:${port}/api/log-ingest/alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ errorLog: alertLog })
        });
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      console.log("\n==========================================================");
      console.log("🚀 TfL FALLBACK TELEMETRY INGESTION COMPLETE!");
      console.log("==========================================================");
    } catch (innerErr) {
      console.error("❌ Deep failure: Unable to connect to local SRE server:", innerErr.message);
    }
  }
}

fetchTransportStatus();
