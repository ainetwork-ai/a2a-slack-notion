import crypto from "crypto";

const privateKey = crypto.randomBytes(32).toString("hex");
console.log("Generated private key:", privateKey);

const res = await fetch("http://localhost:3004/api/auth/key-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ privateKey, displayName: "TestKeyUser" }),
});

const cookie = res.headers.get("set-cookie") || "";
console.log("Status:", res.status);
const body = await res.json();
console.log("Body:", JSON.stringify(body, null, 2));
console.log("Cookie:", cookie.split(";")[0]);

// Verify session works
if (cookie) {
  const meRes = await fetch("http://localhost:3004/api/auth/me", {
    headers: { Cookie: cookie.split(";")[0] },
  });
  console.log("\n/api/auth/me:", await meRes.text());
}
