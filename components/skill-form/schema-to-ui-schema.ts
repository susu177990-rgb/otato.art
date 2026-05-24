import type { UiSchema } from "@rjsf/utils";
import type { SkillJsonSchema } from "@/lib/chat/types";

type SchemaNode = SkillJsonSchema & {
  ui_component?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
};

function widgetForUiComponent(uiComponent: string | undefined): string | undefined {
  switch (uiComponent) {
    case "textarea":
      return "textarea";
    case "asset_uploader":
      return "asset_uploader";
    default:
      return undefined;
  }
}

function walkSchema(node: SchemaNode | undefined, uiPath: string[], uiSchema: UiSchema): void {
  if (!node || typeof node !== "object") return;

  const widget = widgetForUiComponent(node.ui_component);
  if (widget) {
    let target: UiSchema = uiSchema;
    for (let i = 0; i < uiPath.length; i++) {
      const key = uiPath[i]!;
      if (i === uiPath.length - 1) {
        target[key] = { ...(target[key] as UiSchema), "ui:widget": widget };
      } else {
        target[key] = (target[key] as UiSchema) ?? {};
        target = target[key] as UiSchema;
      }
    }
  }

  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      walkSchema(child, [...uiPath, key], uiSchema);
    }
  }

  if (node.items) {
    walkSchema(node.items, uiPath, uiSchema);
  }
}

export function buildUiSchemaFromInputSchema(inputSchema: SkillJsonSchema): UiSchema {
  const uiSchema: UiSchema = {
    optional_parameters: {
      "ui:collapsible": true,
      "ui:collapsed": false,
    },
  };
  walkSchema(inputSchema as SchemaNode, [], uiSchema);
  return uiSchema;
}

const NON_STANDARD_KEYS = ["ui_component", "ui_order", "propertyOrdering"] as const;

/** 移除非标准 Skill 扩展字段，避免干扰 AJV */
export function sanitizeJsonSchema(schema: SkillJsonSchema): SkillJsonSchema {
  const clone = JSON.parse(JSON.stringify(schema)) as SchemaNode;

  function strip(node: SchemaNode | undefined): void {
    if (!node || typeof node !== "object") return;
    for (const key of NON_STANDARD_KEYS) delete node[key];
    if (node.properties) {
      for (const child of Object.values(node.properties)) strip(child);
    }
    if (node.items) strip(node.items);
  }

  strip(clone);
  return clone;
}

/** 将 RJSF 校验错误整理为页面可读的短句 */
export function formatRjsfValidationErrors(errors: Array<{ message?: string; property?: string }>): string {
  return errors
    .slice(0, 5)
    .map((error) => {
      const label = error.property?.replace(/^\./, "").replace(/\./g, " › ") || "表单";
      const message = error.message?.trim() || "填写不符合要求";
      return `${label}：${message}`;
    })
    .join("；");
}
