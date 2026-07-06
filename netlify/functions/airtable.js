const AIRTABLE_API_URL = "https://api.airtable.com/v0";
const TABLES = {
  applications:
    process.env.AIRTABLE_APPLICATIONS_TABLE ||
    "Executive Applications",
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

function normalizeMultiSelect(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
      if (key.endsWith("[]")) {
        const normalizedKey = key.replace("[]", "");
        if (!Array.isArray(data[normalizedKey])) data[normalizedKey] = [];
        data[normalizedKey].push(value);
      } else if (data[key]) {
        if (!Array.isArray(data[key])) data[key] = [data[key]];
        data[key].push(value);
      } else {
        data[key] = value;
      }
    }

    return data;
  }

  try {
    const parsed = JSON.parse(event.body);
    if (parsed?.payload?.data) return parsed.payload.data;
    if (parsed?.data) return parsed.data;
    return parsed;
  } catch {
    return {};
  }
}

function airtableUrl(baseId, tableName) {
  return `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`;
}

async function airtableRequest({ token, baseId, tableName, method = "GET", body }) {
  const response = await fetch(airtableUrl(baseId, tableName), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error("Airtable request failed");
    error.status = response.status;
    error.details = result;
    throw error;
  }

  return result;
}

function airtableEscape(value) {
  return String(value || "").replace(/'/g, "\\'");
}

async function findRecordByFormula({ token, baseId, tableName, formula }) {
  const url = `${airtableUrl(baseId, tableName)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`Airtable lookup failed for ${tableName}:`, result);
    return null;
  }

  return result.records?.[0] || null;
}

async function createRecord({ token, baseId, tableName, fields }) {
  const cleanedFields = { ...fields };

  Object.keys(cleanedFields).forEach((key) => {
    if (cleanedFields[key] === "") delete cleanedFields[key];

    if (Array.isArray(cleanedFields[key]) && cleanedFields[key].length === 0) {
      delete cleanedFields[key];
    }
  });

  const result = await airtableRequest({
    token,
    baseId,
    tableName,
    method: "POST",
    body: {
      records: [{ fields: cleanedFields }],
      typecast: true,
    },
  });

  return result.records?.[0] || null;
}

function scoreApplication(data) {
  let score = 0;

  const stakeholder = clean(data.stakeholder_category).toLowerCase();
  const capacity = clean(data.investment_capacity).toLowerCase();
  const country = clean(data.country_jurisdiction).toLowerCase();
  const area = clean(data.primary_area_of_interest).toLowerCase();
  const organization = clean(data.organization_company);
  const linkedin = clean(data.linkedin_profile);
  const note = clean(data.interest_note);

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
  if (area.includes("sustainable")) score += 8;
  if (area.includes("cultural")) score += 6;

  if (organization) score += 5;
  if (linkedin) score += 5;
  if (note.length >= 120) score += 7;

  return Math.min(score, 100);
}

function priorityFromScore(score) {
  if (score >= 85) return "Tier 1";
  if (score >= 70) return "Tier 2";
  if (score >= 50) return "Tier 3";
  return "Watchlist";
}

function reviewStatusFromScore(score) {
  if (score >= 85) return "Under Review";
  return "New";
}

function buildContactFields(data) {
  const score = scoreApplication(data);

  return {
    "Full Name": clean(data.full_name),
    "Email": clean(data.email_address),
    "Phone": clean(data.phone_number),
    "Title": clean(data.title_position),
    "Organization": clean(data.organization_company),
    "LinkedIn": clean(data.linkedin_profile),
    "Country": clean(data.country_jurisdiction),
    "Stakeholder Category": clean(data.stakeholder_category),
    "Relationship Strength": "Prospect",
    "Strategic Priority": priorityFromScore(score),
    "Contact Status": "New",
    "Notes": clean(data.interest_note),
  };
}

function buildOrganizationFields(data) {
  const score = scoreApplication(data);

  return {
    "Organization Name": clean(data.organization_company),
    "Organization Type": clean(data.stakeholder_category),
    "Country": clean(data.country_jurisdiction),
    "Website": clean(data.organization_website),
    "Industry": clean(data.primary_area_of_interest),
    "Priority Rating": priorityFromScore(score),
    "Existing Relationship": "New",
    "Notes": `Created from Executive Participation Application submitted by ${clean(data.full_name)}.`,
  };
}

function buildApplicationFields(data, linkedContactId, linkedOrganizationId) {
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
    "Priority": priority,

    "Submission Source": clean(data.source_page || "participation"),
    "Campaign": clean(data.campaign || "strategic-sessions-2026"),
    "Platform": clean(data.platform || "thebucklergroup.com"),
    "Form Version": clean(data.form_version || "v4.0"),
    "Date Submitted": new Date().toISOString(),
    "Next Action": score >= 85 ? "Review for invitation approval" : "Review application",
  };

  return fields;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    return jsonResponse(500, {
      error: "Missing Airtable environment variables.",
    });
  }

  const data = parseFormBody(event);

  if (!clean(data.full_name) || !clean(data.email_address)) {
    return jsonResponse(400, {
      error: "Missing required form fields: full_name and email_address.",
    });
  }

try {
  await createRecord({
    token,
    baseId,
    tableName: TABLES.applications,
    fields: buildApplicationFields(data, null, null),
  });

  return redirect("/thank-you/");
} catch (error) {
    console.error("TBG Airtable integration error:", {
      message: error.message,
      status: error.status,
      details: error.details,
    });

    return jsonResponse(error.status || 500, {
      error: "Airtable integration failed.",
      message: error.message,
      details: error.details || null,
    });
  }
};
