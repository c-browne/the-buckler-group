// netlify/functions/airtable.js

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function parseSubmission(event) {
  if (!event.body) return {};

  try {
    const parsed = JSON.parse(event.body);

    // Netlify webhook format
    if (parsed.payload && parsed.payload.data) {
      return parsed.payload.data;
    }

    // Direct JSON format
    if (parsed.data) {
      return parsed.data;
    }

    return parsed;
  } catch {
    return {};
  }
}

function clean(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value).trim();
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE = process.env.AIRTABLE_TABLE || "Executive Applications";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE) {
    return response(500, {
      error: "Missing Airtable environment variables",
    });
  }

  const data = parseSubmission(event);

  const airtableRecord = {
    records: [
      {
        fields: {
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
          "Participation Interest": clean(data.interest),
          "Investment Capacity": clean(data.investment_capacity),
          "Notes": clean(data.interest_note),

          "Review Status": "New",
          "Priority": "Watchlist",

          "Submission Source": clean(data.source_page || "participation"),
          "Campaign": clean(data.campaign || "strategic-sessions-2026"),
          "Form Version": clean(data.form_version || "v3.0"),
          "Platform": clean(data.platform || "thebucklergroup.com"),
          "Date Submitted": new Date().toISOString(),
        },
      },
    ],
    typecast: true,
  };

  const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE
  )}`;

  try {
    const airtableResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(airtableRecord),
    });

    const result = await airtableResponse.json();

    if (!airtableResponse.ok) {
      console.error("Airtable error:", result);
      return response(airtableResponse.status, {
        error: "Airtable record creation failed",
        details: result,
      });
    }

  return {
  statusCode: 302,
  headers: {
    Location: "/thank-you/"
  },
  body: ""
};
  } catch (error) {
    console.error("Function error:", error);

    return response(500, {
      error: "Server error",
      details: error.message,
    });
  }
};
