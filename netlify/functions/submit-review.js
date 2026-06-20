// Dal Bhaat — Review Submission Function
// Receives form POST, appends review to product metafield via Shopify Admin API
// Deploy on Netlify — set env vars: SHOPIFY_STORE, SHOPIFY_TOKEN, REVIEW_SECRET

exports.handler = async (event) => {
  const CORS = {
    "Access-Control-Allow-Origin": "https://dalbhaat.in",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { product_id, name, rating, title, review, secret } = body;

    // Basic validation
    if (secret !== process.env.REVIEW_SECRET) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: "Forbidden" }) };
    }
    if (!product_id || !name || !rating || !review) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Missing required fields" }) };
    }
    if (rating < 1 || rating > 5) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Rating must be 1–5" }) };
    }
    if (name.length > 80 || review.length > 2000) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Input too long" }) };
    }

    const STORE = process.env.SHOPIFY_STORE; // e.g. dauuah-0z.myshopify.com
    const TOKEN = process.env.SHOPIFY_TOKEN; // Admin API token

    // 1. Fetch existing reviews metafield
    const getRes = await fetch(
      `https://${STORE}/admin/api/2024-10/products/${product_id}/metafields.json?namespace=custom&key=reviews`,
      { headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" } }
    );
    const getData = await getRes.json();
    const existing = getData.metafields?.[0];
    let reviews = [];
    if (existing?.value) {
      try { reviews = JSON.parse(existing.value); } catch (_) {}
    }

    // 2. Build new review object
    const newReview = {
      id: Date.now().toString(),
      reviewer_name: { value: name.trim() },
      rating: { value: parseInt(rating, 10) },
      review_title: { value: (title || "").trim() },
      review_body: { value: review.trim() },
      review_date: { value: new Date().toISOString().split("T")[0] },
      verified_buyer: { value: false },
      photos: { value: [] },
      approved: false, // set to true to auto-publish, false = needs your approval
    };

    reviews.unshift(newReview); // newest first

    // 3. Save back
    const payload = {
      metafield: {
        namespace: "custom",
        key: "reviews",
        type: "json",
        value: JSON.stringify(reviews),
      },
    };

    let saveRes;
    if (existing?.id) {
      saveRes = await fetch(
        `https://${STORE}/admin/api/2024-10/metafields/${existing.id}.json`,
        { method: "PUT", headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
    } else {
      payload.metafield.owner_resource = "product";
      payload.metafield.owner_id = product_id;
      saveRes = await fetch(
        `https://${STORE}/admin/api/2024-10/metafields.json`,
        { method: "POST", headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );
    }

    if (!saveRes.ok) {
      const err = await saveRes.text();
      console.error("Shopify error:", err);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Failed to save review" }) };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, message: "Review submitted! It will appear after approval." }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Server error" }) };
  }
};
