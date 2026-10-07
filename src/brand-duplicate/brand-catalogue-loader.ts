import { parseBrandResponse } from "./brand-adapter.js";

export const BRAND_CATALOGUE_URL =
  "https://superpharm-prod.mirakl.net/api/values_lists?code=brand-brand-values";

export async function fetchBrandCatalogue(
  token: string | undefined,
  fetchImplementation: typeof fetch = fetch,
): Promise<ReturnType<typeof parseBrandResponse>> {
  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    throw new Error("Missing API token. Set the BRAND_API_TOKEN environment variable.");
  }

  const response = await fetchImplementation(BRAND_CATALOGUE_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${normalizedToken}` },
  });

  if (!response.ok) {
    throw new Error(`Brand catalogue API request failed with HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Brand catalogue API returned invalid JSON.");
  }

  const brands = parseBrandResponse(payload);
  if (brands.length === 0) {
    throw new Error("Brand catalogue API returned no usable brands.");
  }

  return brands;
}