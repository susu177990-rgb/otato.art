import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
    .join("\n")
    .toLowerCase();
}

function tableDefinition(sql: string, table: string): string {
  const match = sql.match(
    new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\s*\\(([\\s\\S]*?)\\);`, "i"),
  );
  return match?.[1] ?? "";
}

describe("project-owned persistence schema", () => {
  const sql = migrationSql();

  it("binds canvases and generated galleries to a project", () => {
    for (const table of ["canvas_boards", "image_gallery_records", "video_gallery_records"]) {
      expect(sql).toMatch(
        new RegExp(
          `alter\\s+table\\s+public\\.${table}[\\s\\S]*?add\\s+column\\s+if\\s+not\\s+exists\\s+project_id\\s+text`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `alter\\s+table\\s+public\\.${table}[\\s\\S]*?foreign\\s+key\\s*\\(\\s*project_id\\s*,\\s*user_id\\s*\\)[\\s\\S]*?references\\s+public\\.projects\\s*\\(\\s*id\\s*,\\s*user_id\\s*\\)[\\s\\S]*?on\\s+delete\\s+cascade`,
        ),
      );
    }
  });

  it("allows only one canvas per project", () => {
    expect(sql).toMatch(
      /create\s+unique\s+index[\s\S]*?on\s+public\.canvas_boards\s*\(\s*project_id\s*\)/,
    );
  });

  it("stores project assets with CRUD ownership and stable mention identifiers", () => {
    const assets = tableDefinition(sql, "project_assets");
    expect(assets).toMatch(/\bproject_id\s+text\s+not\s+null/);
    expect(assets).toMatch(
      /foreign\s+key\s*\(\s*project_id\s*,\s*user_id\s*\)[\s\S]*?references\s+public\.projects\s*\(\s*id\s*,\s*user_id\s*\)[\s\S]*?on\s+delete\s+cascade/,
    );
    expect(assets).toMatch(/\bid\s+text\s+primary\s+key/);
    expect(assets).toMatch(/\btype\s+text\s+not\s+null/);
    expect(assets).toMatch(/\bname\s+text\s+not\s+null/);
    expect(assets).toMatch(/\bdescription\s+text/);
    expect(assets).toMatch(/\btags\s+text\[\]/);
    expect(assets).toMatch(/\bprimary_image_url\s+text\s+not\s+null/);
    expect(assets).toMatch(/\breference_image_urls\s+text\[\]/);

    expect(sql).toMatch(/alter\s+table\s+public\.project_assets\s+enable\s+row\s+level\s+security/);
    expect(sql).toMatch(
      /create\s+policy[\s\S]*?on\s+public\.project_assets[\s\S]*?(?:for\s+all|for\s+select)/,
    );
  });

  it("does not retain time-based gallery deletion after galleries become permanent", () => {
    const galleryStore = fs.readFileSync(
      path.join(process.cwd(), "lib", "db", "gallery-store.ts"),
      "utf8",
    );
    expect(galleryStore).not.toMatch(/GALLERY_RETENTION_DAYS|cleanupExpiredGalleryRecords/);
  });

  it("implements bounded gallery pagination instead of a fixed first-page-only limit", () => {
    const imageStore = fs.readFileSync(
      path.join(process.cwd(), "lib", "db", "gallery-store.ts"),
      "utf8",
    );
    const videoStore = fs.readFileSync(
      path.join(process.cwd(), "lib", "db", "video-gallery-store.ts"),
      "utf8",
    );

    for (const source of [imageStore, videoStore]) {
      expect(source).toMatch(/\b(cursor|before|offset|page)\b/i);
      expect(source).toMatch(/\.(or|range|lt)\s*\(/);
    }
  });
});
