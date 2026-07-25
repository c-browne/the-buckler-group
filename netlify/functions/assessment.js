// netlify/functions/assessment.js
// The Buckler Group — Strategic Session Assessment Integration v1.0
// TBG website assessment form → Airtable

const AIRTABLE_API_URL = "https://api.airtable.com/v0";

const ASSESSMENTS_TABLE =
  process.env.AIRTABLE_ASSESSMENTS_TABLE ||
  "Strategic Session Executive Debrief";

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function redirectToThankYou() {
  return {
    statusCode: 302,
    headers: {
      Location: "/assessment-thank-you.html",
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
      .filter(Boolean)
      .join(", ");
  }

  return String(value).trim();
}

function normalizeMultiSelect(value) {
  if (!value) {
    return [];
  }

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

function parseFormBody(event) {
  if (!event.body) {
    return {};
  }

  const headers = event.headers || {};

  const contentType =
    headers["content-type"] ||
    headers["Content-Type"] ||
    "";

  if (
    contentType.includes(
      "application/x-www-form-urlencoded"
    )
  ) {
    const params = new URLSearchParams(event.body);
    const data = {};

    for (const [rawKey, value] of params.entries()) {
      const key = rawKey.endsWith("[]")
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

function removeEmptyFields(fields) {
  const cleanedFields = {
    ...fields,
  };

  Object.keys(cleanedFields).forEach((key) => {
    const value = cleanedFields[key];

    if (
      value === "" ||
      value === undefined ||
      value === null
    ) {
      delete cleanedFields[key];
      return;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      delete cleanedFields[key];
    }
  });

  return cleanedFields;
}

function buildAssessmentFields(data) {
  const strategicValueRaw = Number.parseInt(
    clean(data.strategic_value),
    10
  );

  const strategicValue =
    Number.isInteger(strategicValueRaw) &&
    strategicValueRaw >= 1 &&
    strategicValueRaw <= 5
      ? strategicValueRaw
      : null;

  const fields = {
    "Full Name": clean(data.full_name),

    "Email Address": clean(
      data.email_address
    ),

    "Organization": clean(
      data.organization
    ),

    "Title / Position": clean(
      data.title_position
    ),

    "Strategic Value": strategicValue,

    "Investment Horizon": clean(
      data.investment_horizon
    ),

    "Priority Sectors": normalizeMultiSelect(
      data.priority_sectors
    ),

    "Relevant Opportunity": clean(
      data.relevant_opportunity
    ),

    "Opportunity or Obstacle": clean(
      data.opportunity_or_obstacle
    ),

    "TBG Value Pathways": normalizeMultiSelect(
      data.value_pathways
    ),

    "Future Programming": clean(
      data.future_programming
    ),

    "Most Valuable Takeaway": clean(
      data.most_valuable_takeaway
    ),

    "Permission to Follow Up": clean(
      data.permission_to_follow_up
    ),

    "Session Code": clean(
      data.session_code
    ),

    "Session Name": clean(
      data.session_name
    ),

    "Session Jurisdiction": clean(
      data.session_jurisdiction
    ),

    "Submission Source": clean(
      data.submission_source ||
      "TBG Website"
    ),

    "Referral Entry URL": clean(
      data.referral_entry_url
    ),

    "Assessment Status": "New",

  };

  if (fields["Strategic Value"] === null) {
    delete fields["Strategic Value"];
  }

  return removeEmptyFields(fields);
}

function validateAssessment(data) {
  const requiredFields = {
    full_name: clean(data.full_name),

    email_address: clean(
      data.email_address
    ),

    organization: clean(
      data.organization
    ),

    strategic_value: clean(
      data.strategic_value
    ),

    investment_horizon: clean(
      data.investment_horizon
    ),

    most_valuable_takeaway: clean(
      data.most_valuable_takeaway
    ),

    permission_to_follow_up: clean(
      data.permission_to_follow_up
    ),
  };

  const missingFields = Object.entries(
    requiredFields
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingFields.length > 0) {
    return {
      valid: false,
      statusCode: 400,
      body: {
        error:
          "Missing required assessment fields.",
        required: missingFields,
      },
    };
  }

  const strategicValue = Number.parseInt(
    clean(data.strategic_value),
    10
  );

  if (
    !Number.isInteger(strategicValue) ||
    strategicValue < 1 ||
    strategicValue > 5
  ) {
    return {
      valid: false,
      statusCode: 400,
      body: {
        error:
          "Strategic Value must be an integer from 1 to 5.",
      },
    };
  }

  const prioritySectors =
    normalizeMultiSelect(
      data.priority_sectors
    );

  if (prioritySectors.length === 0) {
    return {
      valid: false,
      statusCode: 400,
      body: {
        error:
          "Please select at least one priority sector.",
        required: [
          "priority_sectors",
        ],
      },
    };
  }

  const valuePathways =
    normalizeMultiSelect(
      data.value_pathways
    );

  if (valuePathways.length === 0) {
    return {
      valid: false,
      statusCode: 400,
      body: {
        error:
          "Please select at least one TBG value pathway.",
        required: [
          "value_pathways",
        ],
      },
    };
  }

  return {
    valid: true,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error:
        "Method not allowed. Submit the Strategic Session Assessment form to use this endpoint.",
    });
  }

  const token =
    process.env.AIRTABLE_TOKEN;

  const baseId =
    process.env.AIRTABLE_BASE_ID;

  const tableName =
    ASSESSMENTS_TABLE;

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

  const data =
    parseFormBody(event);

  const validation =
    validateAssessment(data);

  if (!validation.valid) {
    return jsonResponse(
      validation.statusCode,
      validation.body
    );
  }

  const airtableUrl =
    `${AIRTABLE_API_URL}/${baseId}/${encodeURIComponent(
      tableName
    )}`;

  try {
    const airtableResponse =
      await fetch(airtableUrl, {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          records: [
            {
              fields:
                buildAssessmentFields(
                  data
                ),
            },
          ],

          typecast: true,
        }),
      });

    const result =
      await airtableResponse
        .json()
        .catch(() => ({}));

    if (!airtableResponse.ok) {
      console.error(
        "Airtable assessment write failed:",
        {
          status:
            airtableResponse.status,

          tableName,

          details: result,
        }
      );

      return jsonResponse(
        airtableResponse.status,
        {
          error:
            "Airtable assessment integration failed.",

          tableName,

          details: result,
        }
      );
    }

    return redirectToThankYou();
  } catch (error) {
    console.error(
      "Airtable assessment function error:",
      error
    );

    return jsonResponse(500, {
      error:
        "Airtable assessment integration failed.",

      message:
        error instanceof Error
          ? error.message
          : "Unknown server error.",
    });
  }
};
