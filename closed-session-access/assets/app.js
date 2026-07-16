(() => {
  const checkoutButton = document.getElementById("checkoutButton");
  const jurisdictionSelect = document.getElementById("jurisdiction");

  if (!checkoutButton || !jurisdictionSelect) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const jurisdictionFromUrl = params.get("jurisdiction");

  if (jurisdictionFromUrl) {
    const matchingOption = [...jurisdictionSelect.options]
      .find(option => option.value === jurisdictionFromUrl);

    if (matchingOption) {
      jurisdictionSelect.value = jurisdictionFromUrl;
    }
  }

  checkoutButton.addEventListener("click", async () => {
    const originalText = checkoutButton.textContent;

    checkoutButton.disabled = true;
    checkoutButton.textContent = "Opening Secure Checkout…";

    try {
      const response = await fetch(
        "/.netlify/functions/create-executive-session-checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            jurisdiction: jurisdictionSelect.value
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Checkout unavailable.");
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error("Executive Session checkout error:", error);

      window.alert(
        "Secure checkout could not be opened. Please contact info@thebucklergroup.com."
      );

      checkoutButton.disabled = false;
      checkoutButton.textContent = originalText;
    }
  });
})();
