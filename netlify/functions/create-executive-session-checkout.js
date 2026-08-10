const Stripe = require("stripe");

const ALLOWED_JURISDICTIONS = new Set([
  "guyana",
  "barbados",
  "bahamas",
  "grenada",
  "trinidad-tobago",
  "dominican-republic"
]);

const JURISDICTION_NAMES = {
  guyana: "Guyana",
  barbados: "Barbados",
  bahamas: "The Bahamas",
  grenada: "Grenada",
  "trinidad-tobago": "Trinidad & Tobago",
  "dominican-republic": "Dominican Republic"
};

const JURISDICTION_ALIASES = {
  tobago: "trinidad-tobago",
  trinidad: "trinidad-tobago",
  "trinidad & tobago": "trinidad-tobago",
  "trinidad and tobago": "trinidad-tobago",
  "dominican republic": "dominican-republic",
  dr: "dominican-republic"
};

function normalizeJurisdiction(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  return JURISDICTION_ALIASES[raw] || raw;
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed."
    });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured."
      );
    }

    if (!process.env.STRIPE_PRICE_EXECUTIVE_SESSION) {
      throw new Error(
        "STRIPE_PRICE_EXECUTIVE_SESSION is not configured."
      );
    }

    let requestBody;

    try {
      requestBody = JSON.parse(
        event.body || "{}"
      );
    } catch (error) {
      return jsonResponse(400, {
        error: "Invalid request body."
      });
    }

    const jurisdiction = normalizeJurisdiction(
      requestBody.jurisdiction
    );

    if (
      !jurisdiction ||
      !ALLOWED_JURISDICTIONS.has(jurisdiction)
    ) {
      return jsonResponse(400, {
        error:
          "Invalid or unavailable jurisdiction."
      });
    }

    const jurisdictionName =
      JURISDICTION_NAMES[jurisdiction];

    const stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY
    );

    const siteUrl = (
      process.env.URL ||
      "https://thebucklergroup.com"
    ).replace(/\/$/, "");

    const checkoutSession =
      await stripe.checkout.sessions.create({
        mode: "payment",

        line_items: [
          {
            price:
              process.env
                .STRIPE_PRICE_EXECUTIVE_SESSION,
            quantity: 1
          }
        ],

        success_url:
          `${siteUrl}/closed-session-access/success/` +
          `?session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${siteUrl}/closed-session-access/cancel/`,

        billing_address_collection: "required",

        phone_number_collection: {
          enabled: true
        },

        customer_creation: "always",

        metadata: {
          program:
            "Executive Closed Sessions",
          jurisdiction:
            jurisdiction,
          jurisdiction_name:
            jurisdictionName,
          participation_fee:
            "750"
        },

        custom_text: {
          submit: {
            message:
              `Executive Closed Session™ — ${jurisdictionName}`
          }
        },

        custom_fields: [
          {
            key: "organization",
            label: {
              type: "custom",
              custom: "Organization"
            },
            type: "text"
          },
          {
            key: "title",
            label: {
              type: "custom",
              custom: "Executive title"
            },
            type: "text"
          }
        ]
      });

    return jsonResponse(200, {
      url: checkoutSession.url
    });
  } catch (error) {
    console.error(
      "Executive Session checkout error:",
      error
    );

    return jsonResponse(500, {
      error:
        "Secure checkout could not be created."
    });
  }
};
