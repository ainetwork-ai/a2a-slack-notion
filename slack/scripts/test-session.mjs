import { sealData, unsealData } from "iron-session";

const password = "dev-secret-change-in-production-32ch";
const data = { userId: "05fa868f-8391-4c56-8337-3f9ec7216845", ainAddress: "0xtest" };

const sealed = await sealData(data, { password, ttl: 60 * 60 });
console.log("sealed length:", sealed.length);
console.log("sealed:", sealed);

const unsealed = await unsealData(sealed, { password });
console.log("unsealed:", unsealed);

// Test sending it via curl
const cookie = `slack-a2a-session=${sealed}`;
console.log("\nCookie header:");
console.log(cookie);

console.log("\nNow hit /api/auth/me:");
const res = await fetch("http://localhost:3004/api/auth/me", {
  headers: { Cookie: cookie },
});
console.log("status:", res.status);
console.log("body:", await res.text());
