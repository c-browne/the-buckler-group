(() => {
  const checkoutButton =
    document.getElementById("checkoutButton");

  const jurisdictionSelect =
    document.getElementById("jurisdiction");

  if (!checkoutButton || !jurisdictionSelect) {
    return;
  }

  const allowedJurisdictions = new Set([
    "guyana",
    "barbados",
    "bahamas",
    "grenada",
    "trinidad-tobago",
    "dominican-republic"
  ]);

  const jurisdictionNames = {
    guyana: "Guyana",
    barbados: "Barbados",
    bahamas: "The Bahamas",
    grenada: "Grenada",
    "trinidad-tobago": "Trinidad & Tobago",
    "dominican-republic": "Dominican Republic"
  };

  const aliases = {
    tobago: "trinidad-tobago",
    trinidad: "trinidad-tobago",

    "trinidad & tobago":
      "trinidad-tobago",

    "trinidad and tobago":
      "trinidad-tobago",

    "dominican republic":
      "dominican-republic",

    dr: "dominican-republic"
  };

  function normalizeJurisdiction(value) {
    const raw = String(value || "")
      .trim()
      .toLowerCase();

    return aliases[raw] || raw;
  }

  /*
   * Allow direct links such as:
   *
   * /closed-session-access/?jurisdiction=dominican-republic#access
   */

  const params =
    new URLSearchParams(window.location.search);

  const requestedJurisdiction =
    normalizeJurisdiction(
      params.get("jurisdiction")
    );

  if (
    requestedJurisdiction &&
    allowedJurisdictions.has(
      requestedJurisdiction
    )
  ) {
    jurisdictionSelect.value =
      requestedJurisdiction;
  }

  checkoutButton.addEventListener(
    "click",
    async () => {
      const jurisdiction =
        normalizeJurisdiction(
          jurisdictionSelect.value
        );

      if (
        !jurisdiction ||
        !allowedJurisdictions.has(
          jurisdiction
        )
      ) {
        window.alert(
          "Please select an available jurisdiction."
        );

        return;
      }

      const jurisdictionName =
        jurisdictionNames[jurisdiction];

      const originalText =
        checkoutButton.textContent;

      checkoutButton.disabled = true;

      checkoutButton.textContent =
        `Opening ${jurisdictionName} Checkout…`;

      try {
        const response = await fetch(
          "/.netlify/functions/create-executive-session-checkout",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              jurisdiction
            })
          }
        );

        const data =
          await response.json();

        if (!response.ok || !data.url) {
          throw new Error(
            data.error ||
            "Checkout unavailable."
          );
        }

        window.location.assign(
          data.url
        );
      } catch (error) {
        console.error(
          "Executive Session checkout error:",
          error
        );

        window.alert(
          "Secure checkout could not be opened. Please contact info@thebucklergroup.com."
        );

        checkoutButton.disabled = false;

        checkoutButton.textContent =
          originalText;
      }
    }
  );
})();
