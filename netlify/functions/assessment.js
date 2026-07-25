// netlify/functions/assessment.js
// The Buckler Group — Strategic Session Executive Debrief
// Netlify Function → Airtable Integration v2.0

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

const AIRTABLE_TABLE =
  process.env.AIRTABLE_ASSESSMENTS_TABLE ||
  "Strategic Session Executive Debrief";

const SUCCESS_REDIRECT = "/assessment-thank-you/";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function redirectResponse(location = SUCCESS_REDIRECT) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
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
      .filter(Boolean);
  }

  return String(value).trim();
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== "";
    })
  );
}

function parseRequestBody(event) {
  const contentType =
    event.headers?.["content-type"] ||
    event.headers?.["Content-Type"] ||
    "";

  if (!event.body) return {};

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(event.body);
    } catch {
      throw new Error("The submitted JSON body is invalid.");
    }
  }

  const params = new URLSearchParams(event.body);
  const data = {};

  for (const [key, value] of params.entries()) {
    const normalizedKey = key.endsWith("[]")
      ? key.slice(0, -2)
      : key;

    if (Object.prototype.hasOwnProperty.call(data, normalizedKey)) {
      if (!Array.isArray(data[normalizedKey])) {
        data[normalizedKey] = [data[normalizedKey]];
      }

      data[normalizedKey].push(value);
    } else {
      data[normalizedKey] = key.endsWith("[]")
        ? [value]
        : value;
    }
  }

  return data;
}

function normalizeArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item))
      .filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isJsonRequest(event) {
  const contentType =
    event.headers?.["content-type"] ||
    event.headers?.["Content-Type"] ||
    "";

  return contentType.includes("application/json");
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed.",
    });
  }

  const accessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!accessToken || !baseId) {
    console.error("Missing Airtable environment variables.", {
      hasAccessToken: Boolean(accessToken),
      hasBaseId: Boolean(baseId),
    });

    return jsonResponse(500, {
      error: "Airtable integration is not configured.",
    });
  }

  try {
    const submission = parseRequestBody(event);

    // Netlify honeypot protection
    if (clean(submission["bot-field"])) {
      console.warn("Honeypot field completed. Submission rejected.");

      return jsonResponse(400, {
        error: "Invalid submission.",
      });
    }

    const fullName = clean(submission.full_name);
    const emailAddress = clean(submission.email_address);
    const attendanceStatus = clean(submission.attendance_status);
    const permissionToFollowUp = clean(
      submission.permission_to_follow_up
    );

    if (!fullName) {
      return jsonResponse(400, {
        error: "Full Name is required.",
      });
    }

    if (!emailAddress) {
      return jsonResponse(400, {
        error: "Email Address is required.",
      });
    }

    if (!attendanceStatus) {
      return jsonResponse(400, {
        error: "Attendance Status is required.",
      });
    }

    if (!permissionToFollowUp) {
      return jsonResponse(400, {
        error: "Permission to Follow Up is required.",
      });
    }

    /*
     * Important:
     * Airtable Multiple Select fields must receive arrays.
     * Do not convert these values into comma-separated text:
     *
     * - Requested Follow-Up
     * - Closed Executive Session Stakeholders
     */

    const fields = compactObject({
      "Full Name": fullName,
      Email: emailAddress,

      "Attendance Status": attendanceStatus,
      "Participation Barrier": clean(
        submission.participation_barrier
      ),
      "Requested Follow-Up": normalizeArray(
        submission.requested_follow_up
      ),

      "Session Effectiveness": clean(
        submission.session_effectiveness
      ),
      "Greatest Impact": clean(
        submission.greatest_impact
      ),
      "Most Valuable Takeaway": clean(
        submission.most_valuable_takeaway
      ),
      "Greatest Development Barrier": clean(
        submission.greatest_development_barrier
      ),

      "Closed Executive Session Stakeholders": normalizeArray(
        submission.closed_session_stakeholders
      ),
      "Closed Session Topic": clean(
        submission.closed_session_topic
      ),
      "Investment Confidence": clean(
        submission.investment_confidence
      ),
      "Next TBG Offering": clean(
        submission.next_tbg_offering
      ),
      "Strategic Session Recommendation": clean(
        submission.strategic_session_recommendation
      ),

      "Permission to Follow Up": permissionToFollowUp,

      "Session Code": clean(submission.session_code),
      "Strategic Session": clean(submission.session_name),
      "Session Jurisdiction": clean(
        submission.session_jurisdiction
      ),
      "Submission Source": clean(
        submission.submission_source
      ),
      "Referral Entry URL": clean(
        submission.referral_entry_url
      ),
    });

    /*
     * Date Submitted is intentionally omitted.
     * Airtable creates that value automatically through its
     * Created Time/computed field.
     */

    const airtableUrl =
      `${AIRTABLE_API_URL}/${baseId}/` +
      encodeURIComponent(AIRTABLE_TABLE);

    const airtableResponse = await fetch(airtableUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields,
          },
        ],
        typecast: true,
      }),
    });

    const airtableResult = await airtableResponse.json();

    if (!airtableResponse.ok) {
      console.error("Airtable Executive Debrief error:", {
        tableName: AIRTABLE_TABLE,
        status: airtableResponse.status,
        response: airtableResult,
        submittedFields: Object.keys(fields),
      });

      return jsonResponse(airtableResponse.status, {
        error: "Airtable Executive Debrief integration failed.",
        tableName: AIRTABLE_TABLE,
        details: airtableResult,
      });
    }

    console.log("Executive Debrief submitted successfully.", {
      tableName: AIRTABLE_TABLE,
      recordId: airtableResult.records?.[0]?.id,
    });

    if (isJsonRequest(event)) {
      return jsonResponse(200, {
        success: true,
        message: "Executive Debrief submitted successfully.",
        redirect: SUCCESS_REDIRECT,
        recordId: airtableResult.records?.[0]?.id || null,
      });
    }

    return redirectResponse();
  } catch (error) {
    console.error("Executive Debrief function error:", error);

    return jsonResponse(500, {
      error: "The Executive Debrief could not be submitted.",
      details: error.message,
    });
  }
};
