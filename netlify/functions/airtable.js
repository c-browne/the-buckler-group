// netlify/functions/airtable.js
// The Buckler Group — Airtable Integration v4.2
// Safe baseline with institutional referral attribution

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

const APPLICATIONS_TABLE =
  process.env.AIRTABLE_APPLICATIONS_TABLE || "Executive Applications";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function redirectToThankYou() {
  return {
    statusCode: 302,
    headers: {
      Location: "/thank-you/",
      "Cache-Control": "no-store",
    },
    body: "",
  };
}

function clean(value) {
  if (value === undefined || value === null) return "";

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join(", ");
  }

  return String(value).trim();
}

function normalizeMultiSelect(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFormBody(event) {
  if (!event.body) return {};

  const headers = event.headers || {};

  const contentType =
    headers["content-type"] ||
    headers["Content-Type"] ||
    "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(event.body);
    const data = {};

    for (const [rawKey, value] of params.entries()) {
      const key = rawKey.endsWith("[]")
        ? rawKey.slice(0, -2)
        : rawKey;

      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (!Array.isArray(data[key])) {
          data[key] = [data[key]];
        }

        data[key].push(value);
      } else {
        data[key] = value;
      }
    }

    return data;
  }

  try {
    const parsed = JSON.parse(event.body);

    return (
      parsed?.payload?.data ||
      parsed?.data ||
      parsed ||
      {}
    );
  } catch {
    return {};
  }
}

function scoreApplication(data) {
  let score = 0;

  const stakeholder =
    clean(data.stakeholder_category).toLowerCase();

  const capacity =
    clean(data.investment_capacity).toLowerCase();

  const country =
    clean(data.country_jurisdiction).toLowerCase();

  const area =
    clean(data.primary_area_of_interest).toLowerCase();

  const organization =
    clean(data.organization_company);

  const linkedin =
    clean(data.linkedin_profile);

  const note =
    clean(data.interest_note);

  if (stakeholder.includes("institutional investor")) score += 20;
  if (stakeholder.includes("family office")) score += 20;
  if (stakeholder.includes("government")) score += 18;
  if (stakeholder.includes("investment promotion")) score += 16;
  if (stakeholder.includes("developer")) score += 16;
  if (stakeholder.includes("hospitality")) score += 14;
  if (stakeholder.includes("regional")) score += 14;
  if (stakeholder.includes("finance")) score += 12;
  if (stakeholder.includes("academic")) score += 8;

  if (capacity.includes("institutional investor")) score += 18;
  if (capacity.includes("family office")) score += 18;
  if (capacity.includes("developer")) score += 15;
  if (capacity.includes("government")) score += 14;
  if (capacity.includes("advisor")) score += 8;
  if (capacity.includes("academic")) score += 6;

  const priorityJurisdictions = [
    "guyana",
    "barbados",
    "bahamas",
    "grenada",
    "antigua",
    "trinidad",
    "tobago",
  ];

  if (
    priorityJurisdictions.some((jurisdiction) =>
      country.includes(jurisdiction)
    )
  ) {
    score += 12;
  }

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
  return score >= 85 ? "Under Review" : "New";
}

function removeEmptyFields(fields) {
  const cleanedFields = { ...fields };

  Object.keys(cleanedFields).forEach((key) => {
    const value = cleanedFields[key];

    if (value === "") {
      delete cleanedFields[key];
      return;
    }

    if (Array.isArray(value) && value.length === 0) {
      delete cleanedFields[key];
    }
  });

  return cleanedFields;
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
    "Primary Area of Interest": clean(
      data.primary_area_of_interest
    ),
    "Participation Interest": normalizeMultiSelect(
      data.interest
    ),
    "Investment Capacity": clean(data.investment_capacity),
    "Notes": clean(data.interest_note),

    "Executive Engagement Score": score,
    "Review Status": reviewStatusFromScore(score),
    "Strategic Priority": priority,
    "Priority": priority,

    "Referral Partner": clean(data.referral_partner),
    "Referral Code": clean(data.referral_code),
    "Referral Category": clean(data.referral_category),
    "Referral Entry URL": clean(data.referral_entry_url),

    "Submission Source": clean(
      data.source_page || "participation"
    ),

    "Campaign": clean(
      data.campaign || "strategic-sessions-2026"
    ),

    "Platform": clean(
      data.platform || "thebucklergroup.com"
    ),

    "Form Version": clean(
      data.form_version || "v4.2"
    ),

    "Date Submitted": new Date().toISOString(),

    "Next Action":
      score >= 85
        ? "Review for invitation approval"
        : "Review application",
  };

  return removeEmptyFields(fields);
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error:
        "Method not allowed. Submit the participation form to use this endpoint.",
    });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = APPLICATIONS_TABLE;

  if (!token || !baseId) {
    return jsonResponse(500, {
      error:
        "Missing required Airtable environment variables.",
      required: [
        "AIRTABLE_TOKEN",
        "AIRTABLE_BASE_ID",
      ],
    });
  }

  const data = parseFormBody(event);

  if (
    !clean(data.full_name) ||
    !clean(data.email_address)
  ) {
    return jsonResponse(400, {
      error: "Missing required form fields.",
      required: [
        "full_name",
        "email_address",
      ],
    });
  }

  const airtableUrl =
    `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(tableName)}`;

  try {
    const airtableResponse = await fetch(airtableUrl, {
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

    const result = await airtableResponse
      .json()
      .catch(() => ({}));

    if (!airtableResponse.ok) {
      console.error("Airtable write failed:", {
        status: airtableResponse.status,
        tableName,
        details: result,
      });

      return jsonResponse(
        airtableResponse.status,
        {
          error: "Airtable integration failed.",
          tableName,
          details: result,
        }
      );
    }

    return redirectToThankYou();
  } catch (error) {
    console.error(
      "Airtable function error:",
      error
    );

    return jsonResponse(500, {
      error: "Airtable integration failed.",
      message:
        error instanceof Error
          ? error.message
          : "Unknown server error.",
    });
  }
};
