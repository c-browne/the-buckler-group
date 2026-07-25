// netlify/functions/assessment.js
// The Buckler Group
// Strategic Session Executive Debrief → Airtable
// Production Integration v3.0

const crypto = require("crypto");

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

const AIRTABLE_TABLE =
  process.env.AIRTABLE_ASSESSMENT_TABLE ||
  "Strategic Session Executive Debrief";

const SUCCESS_REDIRECT = "/assessment-thank-you/";
const FORM_VERSION = "Executive Debrief v3.0";

/**
 * Standard JSON response.
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
 * Browser redirect response.
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
 * Convert a value into clean text.
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
 * Convert checkbox and multiple-select submissions into arrays.
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
 * Remove blank fields before submitting to Airtable.
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
 * Determine whether the browser submitted JSON.
 */
function isJsonRequest(event) {
  return getContentType(event).includes("application/json");
}

/**
 * Parse JSON or standard HTML form submissions.
 */
function parseRequestBody(event) {
  if (!event.body) {
    return {};
  }

  const contentType = getContentType(event);

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(event.body);
    } catch {
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
 * Basic email-address validation.
 */
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Escape values used inside Airtable formulas.
 */
function escapeAirtableFormulaValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
}

/**
 * Generate a unique internal submission ID.
 */
function createSubmissionId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

/**
 * Search Airtable for a prior submission with the same
 * email address and session code.
 */
async function findDuplicateSubmission({
  accessToken,
  baseId,
  emailAddress,
  sessionCode,
}) {
  const escapedEmail =
    escapeAirtableFormulaValue(emailAddress.toLowerCase());

  const escapedSessionCode =
    escapeAirtableFormulaValue(sessionCode);

  let formula;

  if (sessionCode) {
    formula =
      `AND(` +
      `LOWER({Email Address})="${escapedEmail}",` +
      `{Session Code}="${escapedSessionCode}"` +
      `)`;
  } else {
    formula =
      `LOWER({Email Address})="${escapedEmail}"`;
  }

  const searchUrl =
    `${AIRTABLE_API_URL}/${baseId}/` +
    `${encodeURIComponent(AIRTABLE_TABLE)}` +
    `?maxRecords=1` +
    `&filterByFormula=${encodeURIComponent(formula)}`;

  const response = await fetch(searchUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const responseText = await response.text();

  let result;

  try {
    result = responseText
      ? JSON.parse(responseText)
      : {};
  } catch {
    throw new Error(
      "Airtable returned an invalid response while checking for duplicate submissions."
    );
  }

  if (!response.ok) {
    console.error("Duplicate-submission check failed.", {
      status: response.status,
      tableName: AIRTABLE_TABLE,
      result,
    });

    throw new Error(
      result?.error?.message ||
      "The duplicate-submission check failed."
    );
  }

  const record = result.records?.[0] || null;

  return record;
}

exports.handler = async function handler(event) {
  /*
   * Browser preflight request.
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
   * Only form submissions are permitted.
   */
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed.",
    });
  }

  /*
   * Existing Netlify environment variables.
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
     * Honeypot spam protection.
     */
    if (clean(submission["bot-field"])) {
      console.warn("Rejected submission because the honeypot was completed.");

      return jsonResponse(400, {
        error: "Invalid submission.",
      });
    }

    const fullName = clean(submission.full_name);
    const emailAddress = clean(submission.email_address);
    const attendanceStatus = clean(
      submission.attendance_status
    );
    const permissionToFollowUp = clean(
      submission.permission_to_follow_up
    );
    const sessionCode = clean(
      submission.session_code
    );

    /*
     * Required-field validation.
     */
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
     * Check for an existing response from the same email
     * address for the same session.
     */
    const duplicateRecord = await findDuplicateSubmission({
      accessToken,
      baseId,
      emailAddress,
      sessionCode,
    });

    if (duplicateRecord) {
      console.log("Duplicate Executive Debrief submission prevented.", {
        emailAddress,
        sessionCode,
        existingRecordId: duplicateRecord.id,
      });

      if (isJsonRequest(event)) {
        return jsonResponse(409, {
          success: false,
          duplicate: true,
          error:
            "An Executive Debrief has already been submitted for this email address and session.",
          existingRecordId: duplicateRecord.id,
        });
      }

      return redirectResponse(
        `${SUCCESS_REDIRECT}?status=already-submitted`
      );
    }

    const submissionId = createSubmissionId();

    const userAgent = clean(
      event.headers?.["user-agent"] ||
      event.headers?.["User-Agent"]
    );

    /*
     * Airtable field mapping.
     *
     * Do not add Date Submitted. Airtable calculates
     * that field automatically.
     */
    const airtableFields = removeEmptyFields({
      "Submission ID": submissionId,

      "Form Version": FORM_VERSION,

      "Browser / User Agent": userAgent,

      "Full Name": fullName,

      "Email Address": emailAddress,

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

      "Session Code": sessionCode,

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
            fields: airtableFields,
          },
        ],
        typecast: true,
      }),
    });

    const responseText = await airtableResponse.text();

    let airtableResult;

    try {
      airtableResult = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      airtableResult = {
        error: {
          type: "INVALID_AIRTABLE_RESPONSE",
          message:
            responseText ||
            "Airtable returned an empty response.",
        },
      };
    }

    if (!airtableResponse.ok) {
      console.error(
        "Airtable Executive Debrief submission failed.",
        {
          status: airtableResponse.status,
          tableName: AIRTABLE_TABLE,
          airtableResult,
          submittedFields: Object.keys(airtableFields),
        }
      );

      return jsonResponse(airtableResponse.status, {
        error:
          "Airtable Executive Debrief integration failed.",
        tableName: AIRTABLE_TABLE,
        details: airtableResult,
      });
    }

    const recordId =
      airtableResult.records?.[0]?.id || null;

    /*
     * Record ID is retained in Netlify function logs.
     */
    console.log("Executive Debrief submitted successfully.", {
      tableName: AIRTABLE_TABLE,
      recordId,
      submissionId,
      emailAddress,
      sessionCode,
    });

    if (isJsonRequest(event)) {
      return jsonResponse(200, {
        success: true,
        message:
          "Executive Debrief submitted successfully.",
        redirect: SUCCESS_REDIRECT,
        recordId,
        submissionId,
      });
    }

    return redirectResponse(
      `${SUCCESS_REDIRECT}?status=success`
    );
  } catch (error) {
    console.error("Executive Debrief function error.", {
      message: error.message,
      stack: error.stack,
    });

    return jsonResponse(500, {
      error:
        "The Executive Debrief could not be submitted.",
      details: error.message,
    });
  }
};
