// netlify/functions/assessment.js
// The Buckler Group
// Strategic Session Executive Debrief → Airtable
// Production Integration v2.2

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

const AIRTABLE_TABLE =
  process.env.AIRTABLE_ASSESSMENT_TABLE ||
  "Strategic Session Executive Debrief";

const SUCCESS_REDIRECT = "/assessment-thank-you/";

/**
 * Return a JSON response.
 */
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

/**
 * Redirect the browser after a successful form submission.
 */
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

/**
 * Clean a submitted value.
 */
function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return String(value).trim();
}

/**
 * Convert checkbox or multiple-select values into an array.
 *
 * Airtable multiple-select fields must receive arrays.
 */
function normalizeArray(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Remove blank values before sending data to Airtable.
 */
function removeEmptyFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return value !== "";
    })
  );
}

/**
 * Read the request content type.
 */
function getContentType(event) {
  return (
    event.headers?.["content-type"] ||
    event.headers?.["Content-Type"] ||
    ""
  );
}

/**
 * Determine whether the request body is JSON.
 */
function isJsonRequest(event) {
  return getContentType(event).includes("application/json");
}

/**
 * Parse either:
 * - application/json
 * - application/x-www-form-urlencoded
 */
function parseRequestBody(event) {
  if (!event.body) {
    return {};
  }

  const contentType = getContentType(event);

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(event.body);
    } catch (error) {
      throw new Error("The submitted JSON body is invalid.");
    }
  }

  const params = new URLSearchParams(event.body);
  const data = {};

  for (const [rawKey, value] of params.entries()) {
    const isArrayField = rawKey.endsWith("[]");
    const key = isArrayField
      ? rawKey.slice(0, -2)
      : rawKey;

    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }

      data[key].push(value);
    } else {
      data[key] = isArrayField ? [value] : value;
    }
  }

  return data;
}

/**
 * Validate an email address using a basic format check.
 */
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

exports.handler = async function handler(event) {
  /*
   * Allow browser preflight requests.
   */
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Cache-Control": "no-store",
      },
      body: "",
    };
  }

  /*
   * Only POST submissions are permitted.
   */
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed.",
    });
  }

  /*
   * These names match your existing Netlify variables:
   *
   * AIRTABLE_TOKEN
   * AIRTABLE_BASE_ID
   * AIRTABLE_ASSESSMENT_TABLE
   */
  const accessToken = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!accessToken || !baseId) {
    console.error("Missing Airtable environment variables.", {
      hasAirtableToken: Boolean(accessToken),
      hasAirtableBaseId: Boolean(baseId),
      tableName: AIRTABLE_TABLE,
    });

    return jsonResponse(500, {
      error: "Airtable integration is not configured.",
      missing: {
        AIRTABLE_TOKEN: !accessToken,
        AIRTABLE_BASE_ID: !baseId,
      },
    });
  }

  try {
    const submission = parseRequestBody(event);

    /*
     * Reject bots that complete the hidden honeypot field.
     */
    if (clean(submission["bot-field"])) {
      console.warn("Honeypot field was completed.");

      return jsonResponse(400, {
        error: "Invalid submission.",
      });
    }

    /*
     * Required fields.
     */
    const fullName = clean(submission.full_name);
    const emailAddress = clean(submission.email_address);
    const attendanceStatus = clean(
      submission.attendance_status
    );
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

    if (!isValidEmail(emailAddress)) {
      return jsonResponse(400, {
        error: "Please enter a valid email address.",
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
     * Map website form fields to Airtable fields.
     *
     * Airtable field names must match exactly.
     *
     * Date Submitted is intentionally excluded because
     * Airtable calculates it automatically.
     */
    const airtableFields = removeEmptyFields({
      "Full Name": fullName,

      "Email": emailAddress,

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

      "Closed Executive Session Stakeholders":
        normalizeArray(
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

      "Session Code": clean(
        submission.session_code
      ),

      "Strategic Session": clean(
        submission.session_name
      ),

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
     * Construct the Airtable endpoint.
     */
    const airtableUrl =
      `${AIRTABLE_API_URL}/${baseId}/` +
      encodeURIComponent(AIRTABLE_TABLE);

    /*
     * Send the record to Airtable.
     */
    const airtableResponse = await fetch(airtableUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            fields: airtableFields,
          },
        ],
        typecast: true,
      }),
    });

    /*
     * Parse Airtable's response safely.
     */
    const responseText = await airtableResponse.text();

    let airtableResult;

    try {
      airtableResult = responseText
        ? JSON.parse(responseText)
        : {};
    } catch (error) {
      airtableResult = {
        error: {
          type: "INVALID_AIRTABLE_RESPONSE",
          message: responseText || "Airtable returned an empty response.",
        },
      };
    }

    /*
     * Return Airtable errors with enough detail for troubleshooting.
     */
    if (!airtableResponse.ok) {
      console.error("Airtable Executive Debrief submission failed.", {
        status: airtableResponse.status,
        tableName: AIRTABLE_TABLE,
        airtableResult,
        submittedFields: Object.keys(airtableFields),
      });

      return jsonResponse(airtableResponse.status, {
        error: "Airtable Executive Debrief integration failed.",
        tableName: AIRTABLE_TABLE,
        details: airtableResult,
      });
    }

    const recordId =
      airtableResult.records?.[0]?.id || null;

    console.log("Executive Debrief submitted successfully.", {
      tableName: AIRTABLE_TABLE,
      recordId,
    });

    /*
     * JSON submissions receive a JSON success response.
     */
    if (isJsonRequest(event)) {
      return jsonResponse(200, {
        success: true,
        message: "Executive Debrief submitted successfully.",
        redirect: SUCCESS_REDIRECT,
        recordId,
      });
    }

    /*
     * Standard browser form submissions redirect to the
     * Executive Debrief thank-you page.
     */
    return redirectResponse();
  } catch (error) {
    console.error("Executive Debrief function error.", {
      message: error.message,
      stack: error.stack,
    });

    return jsonResponse(500, {
      error: "The Executive Debrief could not be submitted.",
      details: error.message,
    });
  }
};
