"use client";

import { useMemo, useState } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { createSchemaUtils, type RJSFValidationError } from "@rjsf/utils";
import shellStyles from "@/app/shared/shell.module.css";
import type { SkillJsonSchema } from "@/lib/chat/types";
import {
  buildUiSchemaFromInputSchema,
  formatRjsfValidationErrors,
  sanitizeJsonSchema,
} from "@/components/skill-form/schema-to-ui-schema";
import { AssetUploaderWidget } from "@/components/skill-form/widgets/AssetUploaderWidget";
import styles from "./skill-form.module.css";

const widgets = {
  asset_uploader: AssetUploaderWidget,
};

export function DynamicSkillForm({
  inputSchema,
  disabled,
  onSubmit,
}: {
  inputSchema: SkillJsonSchema;
  disabled?: boolean;
  onSubmit: (payload: unknown) => void;
}) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const schema = useMemo(() => sanitizeJsonSchema(inputSchema), [inputSchema]);
  const uiSchema = useMemo(() => buildUiSchemaFromInputSchema(inputSchema), [inputSchema]);
  const initialFormData = useMemo(() => {
    const utils = createSchemaUtils(validator, schema);
    return utils.getDefaultFormState(schema);
  }, [schema]);

  const handleError = (errors: RJSFValidationError[]) => {
    setValidationError(formatRjsfValidationErrors(errors));
  };

  return (
    <div className={styles.formWrap}>
      {validationError ? <p className={shellStyles.bannerError}>{validationError}</p> : null}
      <Form
        schema={schema as Record<string, unknown>}
        uiSchema={uiSchema}
        validator={validator}
        widgets={widgets}
        disabled={disabled}
        initialFormData={initialFormData}
        showErrorList={false}
        noHtml5Validate
        onChange={() => {
          if (validationError) setValidationError(null);
        }}
        onError={handleError}
        onSubmit={({ formData }) => {
          setValidationError(null);
          onSubmit(formData);
        }}
      >
        <div className={styles.formActions}>
          <button
            type="submit"
            className={[shellStyles.button, shellStyles.buttonPrimary, styles.submitBtn].join(" ")}
            disabled={disabled}
          >
            {disabled ? "生成中…" : "生成分镜"}
          </button>
        </div>
      </Form>
    </div>
  );
}
