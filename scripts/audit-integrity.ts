import path from "node:path";
import { config as loadEnv } from "dotenv";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { captureCreditReservation } from "../lib/credits/accounts";
import { getMediaObject, listMediaObjectKeys, mediaObjectKeyFromPublicUrl } from "../lib/media-storage";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

type Row = Record<string, unknown>;

async function allRows(table: string, columns: string): Promise<Row[]> {
  const admin = createSupabaseAdminClient();
  const result: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    result.push(...((data ?? []) as unknown as Row[]));
    if ((data?.length ?? 0) < 1000) return result;
  }
}

function collectUrls(value: unknown, output = new Set<string>()): Set<string> {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) output.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectUrls(item, output));
  else if (value && typeof value === "object") Object.values(value as Row).forEach((item) => collectUrls(item, output));
  return output;
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  }));
  return results;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const [reservations, orders, images, videos, assets] = await Promise.all([
    allRows("credit_reservations", "id,account_id,user_id,request_id,status,result_ref,feature,model_id,project_id,price_snapshot,metadata"),
    allRows("credit_orders", "id,user_id,status,provider,metadata"),
    allRows("image_gallery_records", "id,user_id,project_id,data"),
    allRows("video_gallery_records", "id,user_id,project_id,data"),
    allRows("project_assets", "id,user_id,project_id,primary_image_url,reference_image_urls"),
  ]);

  const byRequest = new Map<string, Row[]>();
  for (const reservation of reservations) {
    const key = String(reservation.request_id ?? "");
    byRequest.set(key, [...(byRequest.get(key) ?? []), reservation]);
  }
  const crossAccountRequestIds = [...byRequest.entries()]
    .filter(([, rows]) => new Set(rows.map((row) => row.account_id)).size > 1)
    .map(([requestId, rows]) => ({
      requestId,
      reservations: rows.map((row) => ({
        accountId: row.account_id,
        status: row.status,
        feature: row.feature,
        modelId: row.model_id,
        projectId: row.project_id,
        priceSnapshot: row.price_snapshot,
      })),
    }));
  const capturePending = reservations.filter((row) => row.status === "capture_pending" && row.result_ref);
  const suspiciousReservations = reservations.filter((row) =>
    (row.status === "pending" || row.status === "released") &&
    (images.some((image) => image.id === row.request_id) || Boolean(row.result_ref)),
  );
  const creditedWithoutPaidProof = orders.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Row : {};
    return row.provider === "stripe" && row.status === "paid" && metadata.stripePaymentStatus !== "paid";
  });

  const referencedUrls = new Set<string>();
  [...images, ...videos].forEach((row) => collectUrls(row.data, referencedUrls));
  assets.forEach((row) => {
    collectUrls(row.primary_image_url, referencedUrls);
    collectUrls(row.reference_image_urls, referencedUrls);
  });
  const referencedKeys = new Set([...referencedUrls].map(mediaObjectKeyFromPublicUrl).filter((key): key is string => Boolean(key)));
  const danglingChecks = await mapConcurrent([...referencedKeys], 8, async (key) => ({ key, exists: Boolean(await getMediaObject(key)) }));
  const danglingKeys = danglingChecks.filter((item) => !item.exists).map((item) => item.key);
  const storedKeys = await listMediaObjectKeys();
  const orphanKeys = storedKeys.filter((key) => !referencedKeys.has(key));

  const report = {
    mode: apply ? "apply-safe-only" : "dry-run",
    crossAccountRequestIds,
    capturePending: capturePending.map((row) => ({ id: row.id, requestId: row.request_id, resultRef: row.result_ref })),
    suspiciousReservations: suspiciousReservations.map((row) => ({ id: row.id, requestId: row.request_id, status: row.status })),
    creditedWithoutPaidProof: creditedWithoutPaidProof.map((row) => ({ id: row.id, userId: row.user_id })),
    danglingKeys,
    orphanKeys,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!apply) {
    console.log("Dry run only. --apply only captures proven capture_pending reservations; orphan media stays report-only because recent in-flight uploads cannot be distinguished safely.");
    return;
  }

  const applied = { capturedReservations: 0, orphanObjectsReportOnly: orphanKeys.length, errors: [] as string[] };
  for (const row of capturePending) {
    try {
      await captureCreditReservation({ reservationId: String(row.id), resultRef: String(row.result_ref), metadata: { integrityAudit: true } });
      applied.capturedReservations += 1;
    } catch (error) {
      applied.errors.push(error instanceof Error ? error.message : `capture failed: ${row.id}`);
    }
  }
  console.log(JSON.stringify({ applied }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
