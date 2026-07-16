const Stripe = require("stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Method not allowed."
      })
    };
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured.");
    }

    if (!process.env.STRIPE_PRICE_EXECUTIVE_SESSION) {
      throw new Error(
        "STRIPE_PRICE_EXECUTIVE_SESSION is not configured."
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const requestBody = JSON.parse(event.body || "{}");
    const jurisdiction = String(
      requestBody.jurisdiction || "general"
    ).trim();

    const siteUrl = (
      process.env.URL || "https://thebucklergroup.com"
    ).replace(/\/$/, "");

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",

      line_items: [
        {
          price: process.env.STRIPE_PRICE_EXECUTIVE_SESSION,
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
        program: "Executive Closed Sessions",
        jurisdiction,
        participation_fee: "750"
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

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: checkoutSession.url
      })
    };
  } catch (error) {
    console.error("Executive Session checkout error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Secure checkout could not be created."
      })
    };
  }
};
