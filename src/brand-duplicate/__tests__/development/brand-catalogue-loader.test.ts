import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAND_CATALOGUE_URL,
  fetchBrandCatalogue,
} from "../../brand-catalogue-loader.js";

const cataloguePayload = {
  values_lists: [{ values: [{ code: "b_1", label: "Example Brand" }] }],
};

test("fetches and parses the authenticated brand catalogue", async () => {
  let requestedUrl: string | URL | Request | undefined;
  let authorization: string | null | undefined;
  const fetchStub: typeof fetch = async (input, init) => {
    requestedUrl = input;
    authorization = new Headers(init?.headers).get("Authorization");
    return new Response(JSON.stringify(cataloguePayload), { status: 200 });
  };

  const brands = await fetchBrandCatalogue(" token-value ", fetchStub);

  assert.equal(requestedUrl, BRAND_CATALOGUE_URL);
  assert.equal(authorization, "Bearer token-value");
  assert.deepEqual(brands, [{ code: "b_1", label: "Example Brand" }]);
});

test("rejects a missing token without making a request", async () => {
  let requested = false;
  const fetchStub: typeof fetch = async () => {
    requested = true;
    return new Response();
  };

  await assert.rejects(
    fetchBrandCatalogue("  ", fetchStub),
    /Set the BRAND_API_TOKEN environment variable/,
  );
  assert.equal(requested, false);
});

test("rejects an unsuccessful API response", async () => {
  const fetchStub: typeof fetch = async () => new Response(null, { status: 503 });

  await assert.rejects(fetchBrandCatalogue("token-value", fetchStub), /HTTP 503/);
});

test("rejects invalid JSON and payloads without usable brands", async () => {
  const invalidJsonFetch: typeof fetch = async () => new Response("not json", { status: 200 });
  const emptyCatalogueFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ values_lists: [{ values: [] }] }), { status: 200 });

  await assert.rejects(
    fetchBrandCatalogue("token-value", invalidJsonFetch),
    /returned invalid JSON/,
  );
  await assert.rejects(
    fetchBrandCatalogue("token-value", emptyCatalogueFetch),
    /returned no usable brands/,
  );
});