// netlify/functions/airtable.js

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

const TABLES = {
  applications: process.env.AIRTABLE_APPLICATIONS_TABLE || "Executive Applications",
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function redirect(location = "/thank-you/") {
  return {
    statusCode: 302,
    headers: { Location: location },
    body: "",
  };
}

function clean(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value).trim();
}

function parseFormBody(event) {
  if (!event.body) return {};

  const contentType =
    event.headers["content-type"] ||
    event.headers["Content-Type"] ||
    "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(event.body);
    const data = {};

    for (const [key, value] of params.entries()) {
      const normalizedKey = key.endsWith("[]") ? key.replace("[]", "") : key;

      if (data[normalizedKey]) {
        if (!Array.isArray(data[normalizedKey])) {
          data[normalizedKey] = [data[normalizedKey]];
        }
        data[normalizedKey].push(value);
      } else {
        data[normalizedKey] = value;
      }
    }

    return data;
  }

  try {
    const parsed = JSON.parse(event.body);
    return parsed?.payload?.data || parsed?.data || parsed || {};
  } catch {
    return {};
  }
}

function normalizeMultiSelect(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function scoreApplication(data) {
  let score = 0;

  const stakeholder = clean(data.stakeholder_category).toLowerCase();
  const capacity = clean(data.investment_capacity).toLowerCase();
  const country = clean(data.country_jurisdiction).toLowerCase();
  const area = clean(data.primary_area_of_interest).toLowerCase();

  if (stakeholder.includes("government")) score += 18;
  if (stakeholder.includes("institutional investor")) score += 20;
  if (stakeholder.includes("family office")) score += 20;
  if (stakeholder.includes("developer")) score += 16;
  if (stakeholder.includes("hospitality")) score += 14;
  if (stakeholder.includes("investment promotion")) score += 16;
  if (stakeholder.includes("regional")) score += 14;

  if (capacity.includes("institutional investor")) score += 18;
  if (capacity.includes("family office")) score += 18;
  if (capacity.includes("developer")) score += 15;
  if (capacity.includes("government")) score += 14;
  if (capacity.includes("advisor")) score += 8;

  const priorityJurisdictions = [
    "guyana",
    "barbados",
    "bahamas",
    "grenada",
    "antigua",
    "trinidad",
    "tobago",
  ];

  if (priorityJurisdictions.some((j) => country.includes(j))) score += 12;

  if (area.includes("hospitality")) score += 10;
  if (area.includes("real estate")) score += 10;
  if (area.includes("infrastructure")) score += 10;
  if (area.includes("capital")) score += 10;

  if (clean(data.organization_company)) score += 5;
  if (clean(data.linkedin_profile)) score += 5;
  if (clean(data.interest_note).length >= 120) score += 7;

  return Math.min(score, 100);
}

function priorityFromScore(score) {
  if (score >= 85) return "Tier 1";
  if (score >= 70) return "Tier 2";
  if (score >= 50) return "Tier 3";
  return "Watchlist";
}

function reviewStatusFromScore(score) {
  return score >= 85 ? "Under Review" : "New";
}

function buildApplicationFields(data) {
  const score = scoreApplication(data);
  const priority = priorityFromScore(score);

  const fields = {
    "Full Name": clean(data.full_name),
    "Email Address": clean(data.email_address),
    "Phone Number": clean(data.phone_number),
    "Title / Position": clean(data.title_position),
    "Organization": clean(data.organization_company),
    "Country / Jurisdiction": clean(data.country_jurisdiction),
    "LinkedIn Profile": clean(data.linkedin_profile),
    "Organization Website": clean(data.organization_website),
    "Stakeholder Category": clean(data.stakeholder_category),
    "Primary Area of Interest": clean(data.primary_area_of_interest),
    "Participation Interest": normalizeMultiSelect(data.interest),
    "Investment Capacity": clean(data.investment_capacity),
    "Notes": clean(data.interest_note),
    "Executive Engagement Score": score,
    "Review Status": reviewStatusFromScore(score),
    "Strategic Priority": priority,
    "Submission Source": clean(data.source_page || "participation"),
    "Campaign": clean(data.campaign || "strategic-sessions-2026"),
    "Platform": clean(data.platform || "thebucklergroup.com"),
    "Form Version": clean(data.form_version || "v4.0"),
    "Date Submitted": new Date().toISOString(),
    "Next Action": score >= 85 ? "Review for invitation approval" : "Review application",
  };

  Object.keys(fields).forEach((key) => {
    if (fields[key] === "") delete fields[key];
    if (Array.isArray(fields[key]) && fields[key].length === 0) delete fields[key];
  });

  return fields;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = TABLES.applications;

  if (!token || !baseId) {
    return jsonResponse(500, {
      error: "Missing Airtable environment variables.",
    });
  }

  const data = parseFormBody(event);

  if (!clean(data.full_name) || !clean(data.email_address)) {
    return jsonResponse(400, {
      error: "Missing required form fields.",
    });
  }

  const url = `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`;

  try {
    const airtableResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: buildApplicationFields(data),
          },
        ],
        typecast: true,
      }),
    });

    const result = await airtableResponse.json();

    if (!airtableResponse.ok) {
      return jsonResponse(airtableResponse.status, {
        error: "Airtable integration failed.",
        tableName,
        details: result,
      });
    }

    return redirect("/thank-you/");
  } catch (error) {
    return jsonResponse(500, {
      error: "Airtable integration failed.",
      message: error.message,
    });
  }
};
