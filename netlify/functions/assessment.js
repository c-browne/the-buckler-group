// netlify/functions/assessment.js
// The Buckler Group
// Strategic Session Executive Debrief → Airtable
// Production Integration v3.2
//
// Required Netlify environment variables:
// AIRTABLE_TOKEN
// AIRTABLE_BASE_ID
// AIRTABLE_ASSESSMENT_TABLE

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

const AIRTABLE_TABLE =
  process.env.AIRTABLE_ASSESSMENT_TABLE ||
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
      "Cache-Control": "no-store",
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

function normalizeArray(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
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

function getContentType(event) {
  return (
    event.headers?.["content-type"] ||
    event.headers?.["Content-Type"] ||
    ""
  );
}

function isJsonRequest(event) {
  return getContentType(event).includes(
    "application/json"
  );
}

function parseRequestBody(event) {
  if (!event.body) {
    return {};
  }

  const contentType = getContentType(event);

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(event.body);
    } catch {
      throw new Error(
        "The submitted JSON body is invalid."
      );
    }
  }

  const params = new URLSearchParams(event.body);
  const data = {};

  for (const [rawKey, value] of params.entries()) {
    const isArrayField = rawKey.endsWith("[]");

    const key = isArrayField
      ? rawKey.slice(0, -2)
      : rawKey;

    if (
      Object.prototype.hasOwnProperty.call(
        data,
        key
      )
    ) {
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }

      data[key].push(value);
    } else {
      data[key] = isArrayField
        ? [value]
        : value;
    }
  }

  return data;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function parseAirtableResponse(responseText) {
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return {
      error: {
        type: "INVALID_AIRTABLE_RESPONSE",
        message: responseText,
      },
    };
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
        "Cache-Control": "no-store",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed.",
    });
  }

  const accessToken =
    process.env.AIRTABLE_TOKEN;

  const baseId =
    process.env.AIRTABLE_BASE_ID;

  if (!accessToken || !baseId) {
    console.error(
      "Missing Airtable environment variables.",
      {
        hasAirtableToken:
          Boolean(accessToken),
        hasAirtableBaseId:
          Boolean(baseId),
        tableName: AIRTABLE_TABLE,
      }
    );

    return jsonResponse(500, {
      error:
        "Airtable integration is not configured.",
      missing: {
        AIRTABLE_TOKEN: !accessToken,
        AIRTABLE_BASE_ID: !baseId,
      },
    });
  }

  try {
    const submission =
      parseRequestBody(event);

    if (clean(submission["bot-field"])) {
      console.warn(
        "Executive Debrief submission rejected by honeypot."
      );

      return jsonResponse(400, {
        error: "Invalid submission.",
      });
    }

    const fullName = clean(
      submission.full_name
    );

    const emailAddress = clean(
      submission.email_address
    );

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
        error:
          "Please enter a valid email address.",
      });
    }

    if (!attendanceStatus) {
      return jsonResponse(400, {
        error:
          "Attendance Status is required.",
      });
    }

    if (!permissionToFollowUp) {
      return jsonResponse(400, {
        error:
          "Permission to Follow Up is required.",
      });
    }

    const airtableFields =
      removeEmptyFields({
        "Full Name": fullName,

        "Email Address": emailAddress,

        "Attendance Status":
          attendanceStatus,

        "Participation Barrier": clean(
          submission.participation_barrier
        ),

        "Requested Follow-Up":
          normalizeArray(
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

        "Greatest Development Barrier":
          clean(
            submission
              .greatest_development_barrier
          ),

        "Closed Executive Session Stakeholders":
          normalizeArray(
            submission
              .closed_session_stakeholders
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

        "Strategic Session Recommendation":
          clean(
            submission
              .strategic_session_recommendation
          ),

        "Permission to Follow Up":
          permissionToFollowUp,

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
      encodeURIComponent(
        AIRTABLE_TABLE
      );

    const airtableResponse =
      await fetch(airtableUrl, {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json",
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

    const responseText =
      await airtableResponse.text();

    const airtableResult =
      parseAirtableResponse(responseText);

    if (!airtableResponse.ok) {
      console.error(
        "Airtable Executive Debrief integration failed.",
        {
          status:
            airtableResponse.status,
          tableName:
            AIRTABLE_TABLE,
          details:
            airtableResult,
          submittedFields:
            Object.keys(
              airtableFields
            ),
        }
      );

      return jsonResponse(
        airtableResponse.status,
        {
          error:
            "Airtable Executive Debrief integration failed.",
          tableName:
            AIRTABLE_TABLE,
          details:
            airtableResult,
        }
      );
    }

    const recordId =
      airtableResult.records?.[0]?.id ||
      null;

    console.log(
      "Executive Debrief submitted successfully.",
      {
        tableName:
          AIRTABLE_TABLE,
        recordId,
        emailAddress,
      }
    );

    if (isJsonRequest(event)) {
      return jsonResponse(200, {
        success: true,
        message:
          "Executive Debrief submitted successfully.",
        redirect:
          SUCCESS_REDIRECT,
        recordId,
      });
    }

    return redirectResponse(
      `${SUCCESS_REDIRECT}?status=success`
    );
  } catch (error) {
    console.error(
      "Executive Debrief function error.",
      {
        message:
          error.message,
        stack:
          error.stack,
      }
    );

    return jsonResponse(500, {
      error:
        "The Executive Debrief could not be submitted.",
      details:
        error.message,
    });
  }
};
